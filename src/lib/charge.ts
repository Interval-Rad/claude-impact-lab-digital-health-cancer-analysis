// Charge: the orchestrator. Mostly code. Owns order, the indication firewall, QC, the signature gate, audit and timers.
import { Qc, type QcT } from "./schemas";
import { computeRecist, type Measurement } from "./recist";
import { applyFocused, blindRead, buildBlindPayload, focusedPass, reconcile, sizeViolation } from "./lightbox";
import { shouldPage, sortWorklist, triage, lowAgreement } from "./stat";
import { courierA, courierB, courierC, effectiveFindings, LAST_LINE, navigatorTriggers, type ReportInput } from "./courier";
import { callTool, llmMode, MODELS, text } from "./llm";
import { prompts } from "./prompts";
import { audit, listCaseIds, readAudit, readCaseFile, readState, writeState } from "./store";
import { BANNER, type CaseFile, type CaseState, type State } from "./types";
import { FIXTURE_NOTICE } from "./fixtures";

export const ESCALATE_MS = 20_000; // demo clock: 60 minutes runs as 20 seconds
const now = () => new Date().toISOString();
const POST_SIGN: State[] = ["ATTENDING_SIGNED", "DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"];

function save(s: CaseState) { writeState(s); return s; }
function must(id: string): CaseState { const s = readState(id); if (!s) throw new Error("case not started"); return s; }
export class ChargeError extends Error { constructor(m: string, public status = 409) { super(m); } }

function move(s: CaseState, to: State, actor: "charge" | "courier" | "attending" | "resident" | "provider" | "lightbox" | "stat" = "charge") {
  audit({ case_id: s.case_id, actor, event: "state_change", before: s.state, after: to });
  s.state = to;
}

/** Past corrections from this department. Up to five recent reject or edit records with reasons. */
function corrections(): string[] {
  return readAudit().filter((a) => (a.event === "reject" || a.event === "edit") && a.reason).slice(-5)
    .map((a) => `${a.event} on ${JSON.stringify(a.before ?? "")}: ${a.reason}`);
}

export function startCase(id: string): CaseState {
  const existing = readState(id);
  if (existing) return existing;
  const s: CaseState = {
    case_id: id, state: "RECEIVED", version: 1, progress: "Order stored. Indication locked.", created_at: now(),
    mode: llmMode(), models: { lightbox: llmMode() === "live" ? "claude-fable-5-2" : "fixture", sonnet: llmMode() === "live" ? "claude-sonnet-5-5" : "fixture", fell_back: false },
    indication_released_at: null, blind: { a: null, b: null }, lightbox: null, stat: null, paged: null, reviews: {}, measurements: [], recist: null,
    report_draft: "", report_edited: false, drafting: false, qc: { pass: false, mismatches: [], mode: "code_only" },
    resident_signed: null, signature: null, signed_report: null, delivery: null, acknowledged_at: null, order_signed_at: null,
    patient_informed_at: null, voice: null, needs_human_reason: null,
  };
  audit({ case_id: id, actor: "charge", event: "state_change", before: null, after: "RECEIVED" });
  save(s);
  void runPipeline(id);
  return s;
}

function needsHuman(s: CaseState, reason: string) {
  s.needs_human_reason = reason; s.progress = "No AI draft. A person reads this study.";
  s.stat = s.stat ?? { severity_subgroup: "indeterminate_needs_human", urgency_tier: "high", page_on_call: false, context_flags: [], worklist_reason: "No AI draft. A person reads this study." };
  s.drafting = false;
  move(s, "NEEDS_HUMAN"); save(s);
}

async function runPipeline(id: string) {
  const s = must(id), c = readCaseFile(id);
  try {
    // Calls 1 and 2: blind. Payload is built from allowed fields only, then checked for leaks.
    move(s, "BLIND_READING"); s.progress = "Blind read A and B running"; save(s);
    const payload = buildBlindPayload(c, corrections());
    const wire = JSON.stringify(payload);
    for (const secret of [c.synthetic_chart.indication, c.synthetic_chart.prior_report, c.synthetic_chart.display_name, c.synthetic_chart.mrn])
      if (secret && wire.includes(secret)) throw new Error("firewall: blind payload contains held-back context");
    const [ra, rb] = await Promise.allSettled([blindRead(id, c, payload, "A"), blindRead(id, c, payload, "B")]);
    if (ra.status === "rejected" && rb.status === "rejected") return needsHuman(s, `Both blind reads failed: ${String(ra.reason).slice(0, 200)}`);
    s.blind.a = ra.status === "fulfilled" ? ra.value.data : null;
    s.blind.b = rb.status === "fulfilled" ? rb.value.data : null;
    for (const r of [ra, rb]) if (r.status === "fulfilled" && r.value.fellBack) { s.models.fell_back = true; s.models.lightbox = "claude-opus-5-5"; }
    let merged = reconcile(s.blind.a, s.blind.b);
    move(s, "RECONCILED", "lightbox"); s.progress = "Reads reconciled"; save(s);

    // Release the indication, log it, run the focused pass.
    s.indication_released_at = now();
    audit({ case_id: id, actor: "charge", event: "indication_released", after: s.indication_released_at });
    s.progress = "Focused pass running"; save(s);
    const fp = await focusedPass(id, c, merged, { indication: c.synthetic_chart.indication, ordering_provider: c.synthetic_chart.ordering_provider, prior_report: c.synthetic_chart.prior_report });
    if (fp.fellBack) { s.models.fell_back = true; s.models.lightbox = "claude-opus-5-5"; }
    merged = applyFocused(merged, fp.data);
    if (merged.comparability.comparable === "no" && merged.findings.some((f) => f.status === "increased" || f.status === "decreased")) throw new Error("QC: comparable=no with increased/decreased finding");
    if (sizeViolation(merged)) throw new Error("QC: model output contains a size or percent");
    s.lightbox = merged; move(s, "FOCUSED", "lightbox"); s.progress = "Triage running"; save(s);

    // Stat. Code sets the page.
    const st = await triage(c, merged);
    s.stat = { ...st.data, page_on_call: shouldPage(st.data) };
    move(s, "TRIAGED", "stat");
    if (s.stat.page_on_call) { s.paged = { at: now() }; audit({ case_id: id, actor: "charge", event: "page", after: "on-call radiologist paged" }); }
    s.progress = "Report draft running"; save(s);

    await draftAndQc(s, c);
    if (s.state === "NEEDS_HUMAN") return;
    move(s, "DRAFTED", "courier"); s.progress = "Awaiting resident review"; save(s);
  } catch (e) {
    needsHuman(must(id), `Pipeline error: ${String((e as Error).message).slice(0, 300)}`);
  }
}

function reportInput(s: CaseState, c: CaseFile): ReportInput {
  const fs = effectiveFindings(s), ch = c.synthetic_chart;
  const newLesion = fs.some((f) => f.status === "new" && ["nodule_or_mass", "adenopathy", "bone_lesion"].includes(f.kind));
  s.recist = computeRecist(s.measurements, { modality: "XR", newLesion });
  const cmp = s.lightbox!.comparability;
  // Code-computed RECIST stays pure. Charge appends the comparability caveat so a number never reads as a call the images cannot support.
  const caveat = cmp.comparable === "yes" ? "" : ` CAUTION: comparability is ${cmp.comparable} (${cmp.differences.map((d) => d.detail).join("; ") || "technical differences"}). Sizes from different projections are not comparable.`;
  s.recist = { ...s.recist, line: s.recist.line + (s.recist.category === "not_computed" ? "" : caveat) };
  return {
    header: {
      exam: `Chest radiograph, ${c.nih.current.view}, ${ch.current_date} [synthetic date]`, indication: `${ch.indication} [synthetic]`,
      ordering_provider: `${ch.ordering_provider.name}, ${ch.ordering_provider.role}`, comparison: `Chest radiograph, ${c.nih.prior.view}, ${ch.prior_date} [synthetic date]`,
      technique: `Frontal, ${c.nih.current.view}.${cmp.differences.length ? " Differs from prior: " + cmp.differences.map((d) => d.detail).join("; ") + "." : " Same projection as prior."}`,
    },
    findings: fs, merged: s.lightbox!, stat: s.stat!, measurements: s.measurements, recist: s.recist, recistLine: s.recist.line,
  };
}

const MM = /(\d+(?:\.\d+)?)\s*mm/gi;
export function codeQc(report: string, i: ReportInput): QcT["mismatches"] {
  const out: QcT["mismatches"] = [];
  if (!report.trim().endsWith(LAST_LINE)) out.push({ type: "abstention_dropped", finding_id: null, report_text: report.trim().split("\n").pop() ?? "", why: "The last line must be the unchanged AI DRAFT line." });
  for (const c of i.merged.cant_determine) if (!report.includes(c.question))
    out.push({ type: "abstention_dropped", finding_id: c.related_finding, report_text: "", why: `CAN'T DETERMINE item missing: ${c.question}` });
  for (const f of i.findings) if (f.agreement === "status_differs" && !/disagree/i.test(report))
    out.push({ type: "disagreement_hidden", finding_id: f.id, report_text: "", why: "The blind reads disagreed on this finding but the report does not say so." });
  const allowed = new Set<string>();
  for (const m of i.measurements) for (const v of [m.prior_mm, m.current_mm]) if (typeof v === "number") allowed.add(String(v));
  if (i.recist) for (const v of [i.recist.prior_sum, i.recist.current_sum]) if (typeof v === "number") allowed.add(String(v));
  const body = report.replace(i.recistLine, "");
  for (const m of body.matchAll(MM)) if (!allowed.has(String(Number(m[1]))))
    out.push({ type: "number_not_from_confirmed_measurement", finding_id: null, report_text: m[0], why: "Size not from a radiologist-confirmed measurement." });
  if (/\d\s*%/.test(body)) out.push({ type: "number_not_from_confirmed_measurement", finding_id: null, report_text: "%", why: "Percent change must come from the RECIST line only." });
  return out;
}

async function runQc(report: string, i: ReportInput): Promise<CaseState["qc"]> {
  const mismatches = codeQc(report, i);
  if (llmMode() === "live") {
    const r = await callTool({ model: MODELS.sonnet, system: prompts.qc(), toolName: "return_qc", schema: Qc, maxTokens: 2000,
      content: [text(JSON.stringify({ FINDINGS: { merged: { ...i.merged, findings: i.findings }, measurements: i.measurements, recist: i.recistLine }, REPORT: report }))] });
    mismatches.push(...r.data.mismatches);
    return { pass: mismatches.length === 0, mismatches, mode: "model+code" };
  }
  return { pass: mismatches.length === 0, mismatches, mode: "code_only" };
}

/** Courier mode A, then QC. Mismatch: back to Courier once with the list. Second failure: NEEDS_HUMAN. */
async function draftAndQc(s: CaseState, c: CaseFile) {
  let mism: QcT["mismatches"] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const input = reportInput(s, c);
    const report = await courierA(input, mism);
    const qc = await runQc(report, input);
    if (qc.pass) { s.report_draft = report; s.report_edited = false; s.qc = qc; return; }
    mism = qc.mismatches; s.qc = qc;
    audit({ case_id: s.case_id, actor: "charge", event: "qc_fail", after: qc.mismatches, reason: `attempt ${attempt + 1}` });
  }
  needsHuman(s, "QC failed twice on the report draft.");
}

async function redraft(id: string) {
  const s = must(id), c = readCaseFile(id);
  s.drafting = true; s.progress = "Report redraft running"; save(s);
  try {
    await draftAndQc(s, c);
    const t = must(id); t.report_draft = s.report_draft; t.report_edited = false; t.qc = s.qc; t.recist = s.recist;
    if (s.state === "NEEDS_HUMAN") return;
    t.drafting = false; t.progress = POST_SIGN.includes(t.state) ? t.progress : "Awaiting resident review"; save(t);
  } catch (e) { const t = must(id); t.drafting = false; t.progress = `Redraft failed: ${String((e as Error).message).slice(0, 200)}`; save(t); }
}

/** An edit after signature makes a new version and returns the study to RESIDENT_REVIEWED. */
function reopenIfSigned(s: CaseState, actor: "resident" | "attending") {
  if (s.state === "RESIDENT_REVIEWED") { s.resident_signed = null; move(s, "DRAFTED", actor); return; } // edit before attending: resident signs again
  if (!POST_SIGN.includes(s.state)) return;
  s.version += 1; s.signature = null; s.signed_report = null; s.delivery = null; s.acknowledged_at = null;
  s.order_signed_at = null; s.patient_informed_at = null; s.voice = null;
  s.resident_signed = { by: s.resident_signed?.by ?? "Resident (demo)", ts: now(), version: s.version };
  audit({ case_id: s.case_id, actor, event: "state_change", reason: `edit after signature: new version ${s.version}` });
  move(s, "RESIDENT_REVIEWED", actor); s.progress = "New version. Awaiting attending signature";
}

export async function review(id: string, a: { finding_id: string; action: "accept" | "edit" | "reject"; reason?: string; edited_description?: string; by?: string }) {
  const s = must(id);
  if (!["DRAFTED", "RESIDENT_REVIEWED", ...POST_SIGN].includes(s.state)) throw new ChargeError(`cannot review in state ${s.state}`);
  const f = s.lightbox?.findings.find((x) => x.id === a.finding_id);
  if (!f) throw new ChargeError("unknown finding", 404);
  if ((a.action === "edit" || a.action === "reject") && !a.reason?.trim()) throw new ChargeError("a reason is required", 400);
  if (a.action === "edit" && !a.edited_description?.trim()) throw new ChargeError("edited text is required", 400);
  reopenIfSigned(s, "resident");
  const before = s.reviews[a.finding_id] ?? null;
  s.reviews[a.finding_id] = { action: a.action, reason: a.reason?.trim() ?? null, edited_description: a.edited_description?.trim() ?? null, by: a.by ?? "Resident (demo)", ts: now() };
  audit({ case_id: id, actor: "resident", event: a.action, finding_id: a.finding_id, before: before ?? f.description, after: s.reviews[a.finding_id], reason: a.reason ?? null });
  save(s);
  if (a.action !== "accept" || before?.action === "reject" || before?.action === "edit") void redraft(id);
  return s;
}

export async function measure(id: string, m: Measurement[]) {
  const s = must(id);
  if (!["DRAFTED", "RESIDENT_REVIEWED", ...POST_SIGN].includes(s.state)) throw new ChargeError(`cannot measure in state ${s.state}`);
  const clean = m.filter((x) => s.lightbox?.findings.some((f) => f.id === x.finding_id))
    .map((x) => ({ finding_id: x.finding_id, prior_mm: x.prior_mm === null || x.prior_mm === undefined || Number.isNaN(Number(x.prior_mm)) ? null : Number(x.prior_mm), current_mm: x.current_mm === null || x.current_mm === undefined || Number.isNaN(Number(x.current_mm)) ? null : Number(x.current_mm) }));
  reopenIfSigned(s, "resident");
  audit({ case_id: id, actor: "resident", event: "measure", before: s.measurements, after: clean });
  s.measurements = clean; save(s);
  await redraft(id);
  return must(id);
}

export async function editReport(id: string, textIn: string) {
  const s = must(id);
  if (!["DRAFTED", "RESIDENT_REVIEWED"].includes(s.state)) throw new ChargeError(`cannot edit report in state ${s.state}`);
  reopenIfSigned(s, "resident");
  audit({ case_id: id, actor: "resident", event: "edit", before: "report", after: "report edited", reason: "manual report edit" });
  s.report_draft = textIn; s.report_edited = true;
  const c = readCaseFile(id); const input = reportInput(s, c);
  s.qc = await runQc(textIn, input); save(s); return s;
}

export function allReviewed(s: CaseState) { return !!s.lightbox && s.lightbox.findings.every((f) => !!s.reviews[f.id]); }

export function signResident(id: string, by = "Resident (demo)") {
  const s = must(id);
  if (s.state !== "DRAFTED") throw new ChargeError(`resident sign-off needs state DRAFTED, not ${s.state}`);
  if (s.drafting) throw new ChargeError("report is being redrafted");
  if (!allReviewed(s)) throw new ChargeError("every finding must be accepted, edited or rejected first");
  s.resident_signed = { by, ts: now(), version: s.version };
  audit({ case_id: id, actor: "resident", event: "sign", after: s.resident_signed });
  move(s, "RESIDENT_REVIEWED", "resident"); s.progress = "Awaiting attending signature"; return save(s);
}

export async function signAttending(id: string, who = "Attending (demo)") {
  const s = must(id);
  if (s.state !== "RESIDENT_REVIEWED" || !s.resident_signed) throw new ChargeError("attending can sign only after resident review");
  if (!allReviewed(s) || s.drafting) throw new ChargeError("review is incomplete");
  s.signature = { who, ts: now(), version: s.version };
  s.signed_report = s.report_draft.replace(LAST_LINE, `SIGNED by ${who} ${s.signature.ts} (version ${s.version}).`);
  audit({ case_id: id, actor: "attending", event: "sign", after: s.signature });
  move(s, "ATTENDING_SIGNED", "attending"); s.progress = "Signed. Delivering"; save(s);
  return deliver(id);
}

export async function deliver(id: string) {
  const s = must(id), c = readCaseFile(id);
  if (!s.signature || !s.signed_report || s.state !== "ATTENDING_SIGNED") throw new ChargeError("refused: not signed"); // lock 2 of 2
  const fs = effectiveFindings(s);
  const handoff = await courierB({ c, signedReport: s.signed_report, signed: true, signer: s.signature.who, signedAt: s.signature.ts, stat: s.stat!, findings: fs, merged: s.lightbox!, recist: s.recist });
  const tier = s.stat!.urgency_tier, sent = now();
  s.delivery = { ...handoff, sent_at: sent, tier, due_at: tier === "routine" ? null : new Date(Date.now() + ESCALATE_MS).toISOString(), escalated: false,
    actions: [{ ts: sent, action: "send", detail: tier === "routine" ? "Inbox message. Appears in the weekly open-results list if unopened." : "Flagged message." }] };
  audit({ case_id: id, actor: "courier", event: "send", after: { tier } });
  if (tier === "critical") {
    s.delivery.actions.push({ ts: sent, action: "call", detail: "Direct phone call to the ordering provider (simulated)." });
    audit({ case_id: id, actor: "charge", event: "call", after: "direct phone call to ordering provider (simulated)" });
  }
  move(s, "DELIVERED", "courier"); s.progress = "Delivered to ordering provider"; return save(s);
}

/** Lazy timer: evaluated whenever the case is read. 60 minutes on the demo clock is ESCALATE_MS. */
function tick(s: CaseState) {
  const d = s.delivery;
  if (s.state !== "DELIVERED" || !d || d.escalated || !d.due_at || Date.parse(d.due_at) > Date.now()) return;
  d.escalated = true; const ts = now();
  d.actions.push({ ts, action: "resend", detail: "Not opened in 60 demo minutes. Result re-sent." }, { ts, action: "escalate", detail: "Escalated to the covering physician." });
  audit({ case_id: s.case_id, actor: "charge", event: "escalate", after: "re-send and escalate to covering physician" });
  save(s);
}

export function open(id: string) {
  const s = must(id); tick(s);
  if (s.state !== "DELIVERED") throw new ChargeError(`nothing to open in state ${s.state}`);
  s.acknowledged_at = now(); audit({ case_id: id, actor: "provider", event: "open" });
  move(s, "ACKNOWLEDGED", "provider"); return save(s);
}
export function signOrder(id: string) {
  const s = must(id);
  if (!s.signature || !["DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"].includes(s.state)) throw new ChargeError("order is locked until the attending signs and delivers");
  if (!s.delivery?.followup_order) throw new ChargeError("no order to sign");
  s.order_signed_at = now(); audit({ case_id: id, actor: "provider", event: "order", after: s.delivery.followup_order }); return save(s);
}
export function informed(id: string) {
  const s = must(id);
  if (s.state !== "ACKNOWLEDGED") throw new ChargeError("open the result before marking the patient informed");
  s.patient_informed_at = now(); audit({ case_id: id, actor: "provider", event: "informed" });
  move(s, "PATIENT_INFORMED", "provider"); return save(s);
}
export async function voiceScripts(id: string) {
  const s = must(id), c = readCaseFile(id);
  if (s.state !== "PATIENT_INFORMED" || !s.signed_report || !s.delivery) throw new ChargeError("voice is locked until the provider marks the patient informed", 403);
  if (!s.voice) { s.voice = await courierC(s.signed_report, s.delivery.family_page, c); audit({ case_id: id, actor: "courier", event: "voice" }); save(s); }
  return s;
}

// ---------- views for the UI ----------
export function view(id: string) {
  const c = readCaseFile(id); const s = readState(id);
  const ch = c.synthetic_chart, released = !!s?.indication_released_at;
  const head = {
    case_id: id, display_name: ch.display_name, mrn: ch.mrn, prior_date: ch.prior_date, current_date: ch.current_date,
    ordering_provider: ch.ordering_provider, prior_view: c.nih.prior.view, current_view: c.nih.current.view, category_hint: c.category_hint,
    // Held back until Charge releases it after the blind reads.
    indication: released ? ch.indication : null, prior_report: released ? ch.prior_report : null,
    safety_net: { triggers: navigatorTriggers(c), pcp_on_file: ch.pcp_on_file, insurance_on_file: ch.insurance_on_file, preferred_language: ch.preferred_language },
    source: c.source,
  };
  if (!s) return { head, state: null };
  tick(s);
  const fresh = readState(id) ?? s;
  return {
    head,
    state: { ...fresh, banner: fresh.signature ? "SIGNED. Version " + fresh.signature.version : BANNER, fixture_notice: fresh.mode === "fixture" ? FIXTURE_NOTICE : null,
      all_reviewed: allReviewed(fresh), synthetic_fields: ["indication", "prior_report", "vitals", "labs", "problem_list", "dates", "name", "mrn"] },
  };
}

export function worklist() {
  const rows = listCaseIds().map((id) => {
    const v = view(id), s = v.state;
    const base = { case_id: id, patient: v.head.display_name, mrn: v.head.mrn, exam: `CXR ${v.head.prior_view} to ${v.head.current_view}`, indication: v.head.indication,
      arrived: s?.created_at ?? "9999", state: s?.state ?? "NOT_SUBMITTED", progress: s?.progress ?? "" };
    if (!s) return { ...base, tier: null, subgroup: null, lowAgreement: false, reason: "", context_flags: [] as { item: string; bears_on: string; why: string }[], paged_at: null as string | null, not_acknowledged: false, noDraft: false, safety_net: v.head.safety_net.triggers };
    const noDraft = s.state === "NEEDS_HUMAN";
    return { ...base, tier: s.stat?.urgency_tier ?? null, subgroup: s.stat?.severity_subgroup ?? null, lowAgreement: lowAgreement(s), reason: noDraft ? "No AI draft" : s.stat?.worklist_reason ?? "",
      context_flags: s.stat?.context_flags ?? [], paged_at: s.paged?.at ?? null, noDraft, safety_net: v.head.safety_net.triggers,
      not_acknowledged: !!s.delivery && s.state === "DELIVERED" && s.stat?.urgency_tier === "critical" };
  });
  return sortWorklist(rows);
}

export function registry() {
  const syn = [ // SYNTHETIC counts
    { group: "Insured", due: 120, booked: 84, completed: 61 }, { group: "Uninsured", due: 48, booked: 22, completed: 9 },
    { group: "English", due: 96, booked: 66, completed: 49 }, { group: "Spanish", due: 52, booked: 24, completed: 12 },
    { group: "Oncology clinic", due: 70, booked: 60, completed: 52 }, { group: "ED", due: 98, booked: 46, completed: 18 },
  ];
  const live = listCaseIds().map((id) => ({ id, s: readState(id), c: readCaseFile(id) })).filter((x) => x.s?.delivery?.navigator_referral)
    .map((x) => ({ case_id: x.id, patient: x.c.synthetic_chart.display_name, ...x.s!.delivery!.navigator_referral!, state: x.s!.state }));
  return { synthetic: syn, live };
}
