// Charge: the orchestrator. Code owns the order of steps, the indication firewall,
// the signature gate, timers and the audit log. One model call does the report QC.
import fs from "node:fs";
import path from "node:path";
import { caseDir, loadCase, loadImage, toViewLabel } from "./cases";
import { BANNER, MODELS, RECIST_RADIOGRAPH_POLICY } from "./config";
import { draftReport, handoff as courierHandoff, type ReportInput } from "./courier";
import { blindReadTwice } from "./lightbox.blind";
import {
  applyFocused, blindInputFromCase, blindReadProblems, focusedPass, lightboxCodeChecks, reconcile, type CodeCheck,
} from "./lightbox";
import { callModel, type CallMeta } from "./model";
import { chargeQcPrompt } from "./prompts";
import { computeRecist, type RecistResult } from "./recist";
import {
  QcOutput, type BlindRead, type CaseFile, type CourierHandoff, type FocusedPass, type LightboxMerged, type StatOutput,
} from "./schemas";
import { runStat } from "./stat";

export type PipelineState =
  | "RECEIVED" | "BLIND_READING" | "RECONCILED" | "FOCUSED" | "TRIAGED" | "DRAFTED" | "RESIDENT_REVIEWED"
  | "ATTENDING_SIGNED" | "DELIVERED" | "ACKNOWLEDGED" | "PATIENT_INFORMED" | "NEEDS_HUMAN";

export const RUNNING_STATES: PipelineState[] = ["BLIND_READING", "RECONCILED", "FOCUSED", "TRIAGED"];

export interface Review { action: "accepted" | "edited" | "rejected"; reason?: string; text?: string; at: string }
export interface Measurement { finding_id: string; prior_mm: number | null; current_mm: number | null }
export interface Signature { by: string; at: string; version: number }
export interface Delivery {
  sent_at: string;
  tier: StatOutput["urgency_tier"];
  how: string;
  deadline_at: string | null; // demo clock: 60 minutes runs as 20 seconds
  opened_at: string | null;
  escalations: { at: string; action: string }[];
  order_signed_at: string | null;
}

export interface CaseState {
  case_id: string;
  state: PipelineState;
  version: number; // findings version. An edit after signature starts a new one
  arrived_at: string;
  status_text: string;
  busy: string | null; // a background step is running
  error: string | null;
  indication_released_at: string | null;
  blind: { a: BlindRead; b: BlindRead } | null;
  focused: FocusedPass | null;
  lightbox: LightboxMerged | null;
  code_checks: CodeCheck[];
  stat: StatOutput | null;
  paged_on_call_at: string | null;
  report_draft: string | null;
  report_edited_by_hand: boolean;
  qc: QcOutput | null;
  reviews: Record<string, Review>;
  measurements: Measurement[];
  recist: RecistResult | null;
  signature: { resident: Signature | null; attending: Signature | null };
  handoff: CourierHandoff | null;
  delivery: Delivery | null;
  patient_informed: boolean;
  calls: CallMeta[];
}

// ---------- storage and audit ----------

const stateFile = (id: string) => path.join(caseDir(id), "state.json");
const AUDIT_FILE = path.join(process.cwd(), "data", "audit.jsonl");

export function hasState(id: string): boolean {
  return fs.existsSync(stateFile(id));
}

export function loadState(id: string): CaseState | null {
  return hasState(id) ? (JSON.parse(fs.readFileSync(stateFile(id), "utf8")) as CaseState) : null;
}

function save(s: CaseState): CaseState {
  fs.writeFileSync(stateFile(s.case_id), JSON.stringify(s, null, 2));
  return s;
}

type Actor = "lightbox" | "stat" | "courier" | "resident" | "attending" | "provider" | "charge";
export function audit(
  case_id: string, actor: Actor, event: string,
  extra: { finding_id?: string | null; before?: unknown; after?: unknown; reason?: string | null } = {}
): void {
  const record = {
    case_id, ts: new Date().toISOString(), actor, event, finding_id: extra.finding_id ?? null,
    before: extra.before ?? null, after: extra.after ?? null, reason: extra.reason ?? null,
  };
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(record) + "\n");
}

function move(s: CaseState, to: PipelineState, status: string, actor: Actor = "charge"): void {
  const before = s.state;
  s.state = to;
  s.status_text = status;
  save(s);
  if (before !== to) audit(s.case_id, actor, "state_change", { before, after: to });
}

function fresh(id: string): CaseState {
  return {
    case_id: id, state: "RECEIVED", version: 1, arrived_at: new Date().toISOString(),
    status_text: "Received. Indication locked.", busy: null, error: null, indication_released_at: null, blind: null,
    focused: null, lightbox: null, code_checks: [], stat: null, paged_on_call_at: null, report_draft: null,
    report_edited_by_hand: false, qc: null, reviews: {}, measurements: [], recist: null,
    signature: { resident: null, attending: null }, handoff: null, delivery: null, patient_informed: false, calls: [],
  };
}

// In-process registries. On globalThis so they survive dev-server module reloads.
const g = globalThis as unknown as { __irRunning?: Set<string>; __irTimers?: Map<string, NodeJS.Timeout> };
const running = (g.__irRunning ??= new Set<string>());
const timers = (g.__irTimers ??= new Map<string, NodeJS.Timeout>());

export class ChargeError extends Error {
  constructor(message: string, readonly status = 409) { super(message); this.name = "ChargeError"; }
}

function needsHuman(s: CaseState, reason: string): void {
  s.error = reason;
  s.busy = null;
  audit(s.case_id, "charge", "qc_fail", { reason });
  move(s, "NEEDS_HUMAN", "No AI draft. A person reads this study.");
}

// ---------- report draft and the QC call ----------

function reportInput(c: CaseFile, s: CaseState): ReportInput {
  const chart = c.synthetic_chart;
  const lb = s.lightbox!;
  // After review: rejected findings are left out, edited findings carry the radiologist's wording.
  const findings = lb.findings
    .filter((f) => s.reviews[f.id]?.action !== "rejected")
    .map((f) => {
      const r = s.reviews[f.id];
      const { reads: _reads, ...rest } = f;
      return { ...rest, description: r?.action === "edited" && r.text ? r.text : f.description, radiologist_review: r?.action ?? "not reviewed" };
    });
  const kept = new Set(findings.map((f) => f.id));
  const priorView = toViewLabel(c.prior.nih.view_position);
  const currentView = toViewLabel(c.current.nih.view_position);
  return {
    HEADER: {
      exam: `Chest radiograph, one view, ${chart.current_date || "date not recorded"}`,
      clinical_indication: chart.indication,
      ordering_provider: `${chart.ordering_provider.name}, ${chart.ordering_provider.role}`,
      comparison: `Chest radiograph, ${chart.prior_date || "date not recorded"}`,
      technique: `Current ${currentView}. Prior ${priorView}.${priorView !== currentView ? " Projection differs from the prior." : ""}`,
    },
    FINDINGS: { ...lb, findings, look_first: lb.look_first.filter((id) => kept.has(id)) },
    MEASUREMENTS: s.measurements.filter((m): m is { finding_id: string; prior_mm: number; current_mm: number } =>
      m.prior_mm !== null && m.current_mm !== null && kept.has(m.finding_id)),
    RECIST: (s.recist ?? recistFor(s)).line.replace(/^RECIST 1\.1:\s*/, ""), // the template already prints the label
    TRIAGE: s.stat!,
  };
}

function recistFor(s: CaseState): RecistResult {
  const accepted = (id: string) => ["accepted", "edited"].includes(s.reviews[id]?.action ?? "");
  return computeRecist({
    measurements: s.measurements.filter((m) => s.reviews[m.finding_id]?.action !== "rejected"),
    // Only a finding a radiologist accepted counts as a confirmed new lesion.
    newLesion: (s.lightbox?.findings ?? []).some((f) => f.status === "new" && f.kind === "nodule_or_mass" && accepted(f.id)),
    modality: "XR",
    radiographPolicy: RECIST_RADIOGRAPH_POLICY,
  });
}

async function qcCall(caseId: string, label: string, input: ReportInput, report: string) {
  return callModel({
    agent: "charge", label, caseId, model: MODELS.qc, system: chargeQcPrompt(), schema: QcOutput,
    content: [{ type: "text", text: `FINDINGS:\n${JSON.stringify({ findings: input.FINDINGS, measurements: input.MEASUREMENTS, recist: input.RECIST })}\n\nREPORT:\n${report}` }],
  });
}

/** Draft, QC, and on a mismatch one redraft and one more QC. Returns whether QC passed in the end. */
async function draftAndCheck(c: CaseFile, s: CaseState, tag: string): Promise<boolean> {
  const input = reportInput(c, s);
  let draft = await draftReport(s.case_id, `report_${tag}`, input);
  s.calls.push(draft.meta);
  let qc = await qcCall(s.case_id, `qc_${tag}`, input, draft.data.report);
  s.calls.push(qc.meta);
  if (!qc.data.pass || qc.data.mismatches.length) {
    audit(s.case_id, "charge", "qc_fail", { after: qc.data.mismatches, reason: "report does not match findings. Returned to Courier once" });
    draft = await draftReport(s.case_id, `report_${tag}_redraft`, input, qc.data.mismatches);
    s.calls.push(draft.meta);
    qc = await qcCall(s.case_id, `qc_${tag}_redraft`, input, draft.data.report);
    s.calls.push(qc.meta);
  }
  s.report_draft = draft.data.report;
  s.report_edited_by_hand = false;
  s.qc = { pass: qc.data.pass && qc.data.mismatches.length === 0, mismatches: qc.data.mismatches };
  return s.qc.pass;
}

// ---------- the pipeline: RECEIVED to DRAFTED ----------

/** Starts the pipeline in the background and returns at once. The UI polls the case state. */
export function startPipeline(id: string): CaseState {
  loadCase(id); // throws on an unknown case
  if (running.has(id)) throw new ChargeError("This case is already running.");
  const existing = loadState(id);
  if (existing && existing.signature.attending) throw new ChargeError("This case is signed. It cannot be re-run.");
  const s = fresh(id);
  if (existing) s.arrived_at = existing.arrived_at;
  save(s);
  audit(id, "charge", "state_change", { before: null, after: "RECEIVED" });
  running.add(id);
  void pipeline(s).finally(() => running.delete(id));
  return s;
}

async function pipeline(s: CaseState): Promise<void> {
  const id = s.case_id;
  try {
    const c = loadCase(id);
    const chart = c.synthetic_chart;
    const prior = loadImage(id, "prior");
    const current = loadImage(id, "current");

    // Calls 1 and 2. The payload is built from images and view labels only.
    move(s, "BLIND_READING", "Blind read A and blind read B running");
    const { a, b } = await blindReadTwice(id, blindInputFromCase(c, prior, current), blindReadProblems);
    s.blind = { a: a.data, b: b.data };
    s.calls.push(a.meta, b.meta);
    s.lightbox = reconcile(a.data, b.data);
    move(s, "RECONCILED", "Two blind reads merged. Agreement set on each finding", "lightbox");

    // Only now, with both blind reads saved, is the indication released.
    if (!chart.indication.trim()) return needsHuman(s, "The order has no indication, so the focused pass cannot run.");
    s.indication_released_at = new Date().toISOString();
    audit(id, "charge", "indication_released", { after: s.indication_released_at });
    s.status_text = "Indication released. Focused pass running";
    save(s);
    const f = await focusedPass(id, s.lightbox, prior, current, {
      indication: chart.indication, ordering_provider: chart.ordering_provider, prior_report: chart.prior_report,
    });
    s.focused = f.data;
    s.calls.push(f.meta);
    s.lightbox = applyFocused(s.lightbox, f.data);
    s.code_checks = lightboxCodeChecks(a.data, b.data, s.lightbox, f.data);
    move(s, "FOCUSED", "Focused pass done. Triage running", "lightbox");
    const failed = s.code_checks.filter((x) => !x.pass);
    if (failed.length) return needsHuman(s, `Lightbox output failed code checks: ${failed.map((x) => `${x.check} (${x.detail})`).join("; ")}`);

    const stat = await runStat(id, s.lightbox, chart);
    s.stat = stat.data;
    s.calls.push(stat.meta);
    if (stat.data.page_on_call) {
      s.paged_on_call_at = new Date().toISOString();
      audit(id, "charge", "page", { after: "on-call radiologist", reason: stat.data.worklist_reason });
    }
    move(s, "TRIAGED", "Triaged. Report draft and quality check running", "stat");

    s.measurements = s.lightbox.findings.filter((x) => x.needs_measurement).map((x) => ({ finding_id: x.id, prior_mm: null, current_mm: null }));
    s.recist = recistFor(s);
    const pass = await draftAndCheck(c, s, `v${s.version}`);
    if (!pass) return needsHuman(s, "The report draft failed the quality check twice.");
    move(s, "DRAFTED", "AI draft ready for resident review", "courier");
  } catch (e) {
    needsHuman(s, String((e as Error).message ?? e));
  }
}

// ---------- the human gate ----------

function requireState(id: string): CaseState {
  const s = loadState(id);
  if (!s) throw new ChargeError("This case has not been run.", 404);
  if (running.has(id) || s.busy) throw new ChargeError("A step is still running on this case.");
  return s;
}

const REVIEWABLE: PipelineState[] = ["DRAFTED", "RESIDENT_REVIEWED", "ATTENDING_SIGNED", "DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"];

/** An edit after signature starts a new version and returns the study to review (rule 7). */
function reopenIfSigned(s: CaseState, why: string): void {
  if (s.signature.attending || s.signature.resident) {
    const hadAttending = Boolean(s.signature.attending);
    s.signature = { resident: null, attending: null };
    if (hadAttending) {
      s.version += 1;
      s.handoff = null;
      s.delivery = null;
      s.patient_informed = false;
      const t = timers.get(s.case_id);
      if (t) { clearTimeout(t); timers.delete(s.case_id); }
    }
    move(s, "DRAFTED", `Reopened after ${why}. Signatures cleared. Review and sign again`);
  }
}

export function review(id: string, findingId: string, r: Omit<Review, "at"> | null): CaseState {
  const s = requireState(id);
  if (!REVIEWABLE.includes(s.state) || !s.lightbox) throw new ChargeError(`Cannot review in state ${s.state}.`);
  if (!s.lightbox.findings.some((f) => f.id === findingId)) throw new ChargeError("Unknown finding.", 404);
  if (r && r.action !== "accepted" && !r.reason?.trim()) throw new ChargeError("Edit and Reject need a reason.", 400);
  if (r?.action === "edited" && !r.text?.trim()) throw new ChargeError("Edit needs the corrected text.", 400);
  const before = s.reviews[findingId] ?? null;
  reopenIfSigned(s, "a change to a finding");
  if (r) s.reviews[findingId] = { ...r, at: new Date().toISOString() };
  else delete s.reviews[findingId];
  const event = r === null ? "edit" : r.action === "accepted" ? "accept" : r.action === "edited" ? "edit" : "reject";
  audit(id, "resident", event, { finding_id: findingId, before, after: r, reason: r?.reason ?? (r === null ? "review cleared" : null) });
  s.recist = recistFor(s);
  return save(s);
}

export function measure(id: string, m: Measurement): CaseState {
  const s = requireState(id);
  if (!REVIEWABLE.includes(s.state) || !s.lightbox) throw new ChargeError(`Cannot enter measurements in state ${s.state}.`);
  if (!s.lightbox.findings.some((f) => f.id === m.finding_id)) throw new ChargeError("Unknown finding.", 404);
  const ok = (v: number | null) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1000);
  if (!ok(m.prior_mm) || !ok(m.current_mm)) throw new ChargeError("Measurements are millimeters, zero or more.", 400);
  const before = s.measurements.find((x) => x.finding_id === m.finding_id) ?? null;
  reopenIfSigned(s, "a change to a measurement");
  s.measurements = [...s.measurements.filter((x) => x.finding_id !== m.finding_id), { finding_id: m.finding_id, prior_mm: m.prior_mm, current_mm: m.current_mm }];
  s.recist = recistFor(s);
  audit(id, "resident", "measure", { finding_id: m.finding_id, before, after: m });
  return save(s);
}

export function saveReport(id: string, text: string): CaseState {
  const s = requireState(id);
  if (!REVIEWABLE.includes(s.state)) throw new ChargeError(`Cannot edit the report in state ${s.state}.`);
  if (text === s.report_draft) return s;
  const before = s.report_draft;
  reopenIfSigned(s, "an edit to the report");
  s.report_draft = text;
  s.report_edited_by_hand = true;
  s.qc = null; // the QC result described the previous text
  audit(id, "resident", "edit", { before: before?.slice(0, 200), after: text.slice(0, 200), reason: "report text edited by hand" });
  return save(s);
}

/** Runs `work` in the background with the case marked busy. Errors land in s.error, visibly. */
function background(s: CaseState, label: string, work: () => Promise<void>): void {
  s.busy = label;
  s.error = null;
  save(s);
  running.add(s.case_id);
  void work()
    .catch((e) => { s.error = String((e as Error).message ?? e); audit(s.case_id, "charge", "qc_fail", { reason: s.error }); })
    .finally(() => { s.busy = null; running.delete(s.case_id); save(s); });
}

export function sign(id: string, role: "resident" | "attending", by: string): CaseState {
  const s = requireState(id);
  if (!s.lightbox) throw new ChargeError("There is no draft to sign.");
  const c = loadCase(id);
  const unreviewed = s.lightbox.findings.filter((f) => !s.reviews[f.id]).map((f) => f.id);
  if (unreviewed.length) throw new ChargeError(`Not every finding is reviewed: ${unreviewed.join(", ")}.`);

  if (role === "resident") {
    if (s.state !== "DRAFTED") throw new ChargeError(`Resident sign-off is not available in state ${s.state}.`);
    s.recist = recistFor(s);
    s.signature.resident = { by, at: new Date().toISOString(), version: s.version };
    audit(id, "resident", "sign", { after: s.signature.resident });
    move(s, "RESIDENT_REVIEWED", "Resident reviewed. Waiting for the attending", "resident");
    // Courier redrafts from the reviewed findings and confirmed measurements, unless the
    // resident has rewritten the report by hand. Either way the QC call checks the text.
    background(s, "Courier redrafting from the reviewed findings. Quality check running", async () => {
      if (s.report_edited_by_hand && s.report_draft) {
        const qc = await qcCall(id, `qc_v${s.version}_hand_edited`, reportInput(c, s), s.report_draft);
        s.calls.push(qc.meta);
        s.qc = { pass: qc.data.pass && qc.data.mismatches.length === 0, mismatches: qc.data.mismatches };
      } else {
        await draftAndCheck(c, s, `v${s.version}_reviewed`);
      }
      s.status_text = s.qc?.pass ? "Resident reviewed. Report redrafted, quality check passed. Waiting for the attending"
        : "Resident reviewed. Quality check found mismatches: see the report panel";
    });
    return s;
  }

  if (s.state !== "RESIDENT_REVIEWED" || !s.signature.resident) throw new ChargeError("The resident signs first.");
  if (!s.report_draft) throw new ChargeError("There is no report to sign.");
  s.signature.attending = { by, at: new Date().toISOString(), version: s.version };
  audit(id, "attending", "sign", { after: s.signature.attending });
  move(s, "ATTENDING_SIGNED", "Signed by the attending. Courier preparing the handoff", "attending");
  background(s, "Courier preparing the provider message and follow-up order", () => deliver(s, c));
  return s;
}

// ---------- after signature ----------

const DEMO_HOUR_MS = 20_000; // demo clock: 60 minutes runs as 20 seconds

async function deliver(s: CaseState, c: CaseFile): Promise<void> {
  // Lock one of two. Courier checks the same condition itself.
  const sig = s.signature.attending;
  if (!sig || sig.version !== s.version || !s.report_draft || !s.stat) {
    throw new ChargeError("NOT_SIGNED: nothing leaves radiology before the attending signs this version.");
  }
  const chart = c.synthetic_chart;
  const result = await courierHandoff(s.case_id, {
    signed: true, signer: sig.by, signed_at: sig.at, findings_version: s.version,
    signed_report: s.report_draft.replace(/\n?AI DRAFT: requires resident review and attending signature\.\s*$/, "").trimEnd() +
      `\n\nSigned by ${sig.by}, ${sig.at}.`,
    triage: s.stat,
    patient_context: {
      pcp_on_file: chart.pcp_on_file, insurance_on_file: chart.insurance_on_file,
      preferred_language: chart.preferred_language, ordering_role: chart.ordering_provider.role,
    },
  });
  s.calls.push(result.meta);
  s.handoff = result.data;
  const tier = s.stat.urgency_tier;
  const now = Date.now();
  const timed = tier === "high" || tier === "critical";
  s.delivery = {
    sent_at: new Date(now).toISOString(), tier,
    how: tier === "routine" ? "Inbox message" : tier === "high" ? "Flagged message" : "Flagged message and a direct phone call to the provider",
    deadline_at: timed ? new Date(now + DEMO_HOUR_MS).toISOString() : null,
    opened_at: null, escalations: [], order_signed_at: null,
  };
  audit(s.case_id, "courier", "send", { after: { to: chart.ordering_provider.name, how: s.delivery.how } });
  if (tier === "critical") audit(s.case_id, "charge", "call", { after: "direct phone call to the ordering provider" });
  move(s, "DELIVERED", `Delivered to ${chart.ordering_provider.name}. ${timed ? "Not opened yet: the 60 minute timer is running" : "Routine: stays in the inbox"}`, "courier");
  if (timed) {
    const id = s.case_id;
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      const latest = loadState(id);
      if (!latest?.delivery || latest.delivery.opened_at) return;
      const action = "Not opened at 60 minutes. Re-sent and escalated to the covering physician";
      latest.delivery.escalations.push({ at: new Date().toISOString(), action });
      latest.status_text = `${action}.${latest.delivery.tier === "critical" ? " Not acknowledged." : ""}`;
      save(latest);
      audit(id, "charge", "escalate", { after: action });
    }, DEMO_HOUR_MS));
  }
}

function requireDelivered(id: string): CaseState {
  const s = requireState(id);
  if (!s.signature.attending || !s.delivery || !s.handoff) throw new ChargeError("NOT_SIGNED: no signed result has been delivered for this case.");
  return s;
}

export function providerOpen(id: string): CaseState {
  const s = requireDelivered(id);
  if (s.delivery!.opened_at) return s;
  s.delivery!.opened_at = new Date().toISOString();
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  audit(id, "provider", "open");
  move(s, "ACKNOWLEDGED", "Opened by the ordering provider", "provider");
  return s;
}

/** The provider signs the pre-filled order. No agent places an order. */
export function providerSignOrder(id: string, by: string): CaseState {
  const s = requireDelivered(id);
  if (!s.handoff!.followup_order) throw new ChargeError("The signed report recommends no follow-up order.");
  if (!s.delivery!.opened_at) throw new ChargeError("Open the result before signing the order.");
  s.delivery!.order_signed_at = new Date().toISOString();
  audit(id, "provider", "sign", { after: { order: s.handoff!.followup_order, by } });
  return save(s);
}

export function providerInformed(id: string): CaseState {
  const s = requireDelivered(id);
  if (!s.delivery!.opened_at) throw new ChargeError("Open the result first.");
  s.patient_informed = true;
  audit(id, "provider", "state_change", { before: s.state, after: "PATIENT_INFORMED", reason: "provider marked the patient conversation done" });
  move(s, "PATIENT_INFORMED", "The provider has told the patient", "provider");
  return s;
}

export { BANNER };
