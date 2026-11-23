// The one server-side loader the screens read from.
// Today: the hand-written fixture plus the real case folders (images only, nothing run).
// The main session replaces the bodies of getCasePayload and getWorklist with pipeline output.
// Server only: uses node:fs. Never import this from a "use client" file (import types from ./types).
import fs from "node:fs";
import path from "node:path";
import { assertCaseId, listCaseIds, loadCase, toViewLabel } from "@/lib/cases";
import { hasBaseline, loadState, type CaseState } from "@/lib/charge";
import { BANNER, isReplay } from "@/lib/config";
import { sortWorklist as sortRows } from "@/lib/stat";
import type { CasePayload, InboxItem, WorklistRow } from "./types";

export const FIXTURE_ID = "fixture_demo";
export const NOT_RUN_STATE = "RECEIVED — not run yet";

function loadFixture(): CasePayload {
  const file = path.join(process.cwd(), "fixtures", "demo_case.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as CasePayload;
}

// A real case folder with no pipeline output: only what is truly known.
// No findings, tier, name or indication is made up here.
function notRunPayload(id: string): CasePayload {
  const c = loadCase(id);
  return {
    case_id: c.case_id,
    state: NOT_RUN_STATE,
    banner: BANNER,
    header: {
      display_name: null,
      mrn: null,
      exam: null,
      prior: { view: toViewLabel(c.prior.nih.view_position), date: null },
      current: { view: toViewLabel(c.current.nih.view_position), date: null },
      arrived_at: null,
    },
    images: {
      prior: `/api/cases/${id}/image/prior`,
      current: `/api/cases/${id}/image/current`,
    },
    indication: null,
    ordering_provider: null,
    prior_report: null,
    indication_released_at: null,
    lightbox: null,
    stat: null,
    measurements: [],
    recist: null,
    reviews: {},
    report_draft: null,
    qc: null,
    signature: null,
    synthetic_fields: [],
  };
}

const SYNTHETIC_FIELDS = ["display_name", "mrn", "dates", "indication", "ordering_provider", "prior_report", "vitals", "labs", "problem_list"];

// What Charge sends the UI for a case that has been run.
// The indication and the prior report stay on the server until Charge has released them.
function statePayload(id: string, s: CaseState): CasePayload {
  const c = loadCase(id);
  const chart = c.synthetic_chart;
  const released = s.indication_released_at !== null;
  const signed = s.signature.attending !== null;
  return {
    case_id: id,
    state: s.state,
    version: s.version,
    banner: BANNER,
    header: {
      display_name: chart.display_name || null,
      mrn: chart.mrn || null,
      exam: "XR CHEST 1 VIEW",
      prior: { view: toViewLabel(c.prior.nih.view_position), date: chart.prior_date || null },
      current: { view: toViewLabel(c.current.nih.view_position), date: chart.current_date || null },
      arrived_at: s.arrived_at,
    },
    images: { prior: `/api/cases/${id}/image/prior`, current: `/api/cases/${id}/image/current` },
    indication: released ? chart.indication : null,
    ordering_provider: released ? chart.ordering_provider : null,
    prior_report: released ? chart.prior_report : null,
    indication_released_at: s.indication_released_at,
    lightbox: s.state === "NEEDS_HUMAN" ? null : s.lightbox, // NEEDS_HUMAN: a person reads with no AI draft
    // (qc below still carries the mismatches, so the screen can say why)
    stat: s.state === "NEEDS_HUMAN" ? null : s.stat,
    measurements: s.measurements,
    recist: s.recist ? { category: s.recist.category, line: s.recist.line } : null,
    reviews: s.reviews,
    report_draft: s.state === "NEEDS_HUMAN" ? null : s.report_draft,
    qc: s.qc,
    signature: { resident: s.signature.resident, attending: s.signature.attending },
    delivery: signed ? s.delivery : null,
    handoff: signed ? s.handoff : null, // nothing after the gate is sent to the browser unsigned
    patient_informed: s.patient_informed,
    status_text: s.status_text,
    busy: s.busy,
    error: s.error,
    code_checks: s.code_checks,
    paged_on_call_at: s.paged_on_call_at,
    can_reset: hasBaseline(id),
    replay: isReplay(),
    synthetic_fields: SYNTHETIC_FIELDS,
    calls: s.calls.map((m) => ({ label: m.label, model: m.model, replayed: m.replayed, recorded_at: m.recorded_at })),
  };
}

/** Returns null when the id is malformed or no such case exists. */
export function getCasePayload(id: string): CasePayload | null {
  if (id === FIXTURE_ID) return loadFixture();
  try {
    assertCaseId(id);
    const s = loadState(id);
    return s ? statePayload(id, s) : notRunPayload(id);
  } catch {
    return null;
  }
}

/** The ordering provider's inbox: attending-signed, delivered results only. */
export function getInbox(): InboxItem[] {
  const items: InboxItem[] = [];
  for (const id of listCaseIds()) {
    const p = getCasePayload(id);
    if (!p || !p.signature?.attending || !p.delivery || !p.handoff) continue;
    items.push({
      case_id: id, patient: p.header.display_name, mrn: p.header.mrn, subject: p.handoff.provider_message.subject,
      tier: p.delivery.tier, sent_at: p.delivery.sent_at, opened_at: p.delivery.opened_at,
      deadline_at: p.delivery.deadline_at, escalated: p.delivery.escalations.length > 0,
    });
  }
  return items.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

function agreementFlag(p: CasePayload): WorklistRow["agreement_flag"] {
  if (!p.lightbox) return null;
  const f = p.lightbox.findings;
  if (p.lightbox.study_flags.length > 0 || f.some((x) => x.agreement === "status_differs")) return "reads_disagree";
  if (f.some((x) => x.agreement === "1_of_2")) return "one_of_two";
  return "reads_agree";
}

function toRow(p: CasePayload): WorklistRow {
  return {
    case_id: p.case_id,
    mock: p._mock === true,
    // agents/03_STAT_triage.md: rows in NEEDS_HUMAN show "No AI draft" and sort with tier high.
    tier: p.stat?.urgency_tier ?? (p.state === "NEEDS_HUMAN" ? "high" : null),
    severity_subgroup: p.stat?.severity_subgroup ?? null,
    agreement_flag: agreementFlag(p),
    patient: p.header.display_name,
    mrn: p.header.mrn,
    exam: p.header.exam,
    views: { prior: p.header.prior.view, current: p.header.current.view },
    indication: p.indication,
    indication_released_at: p.indication_released_at,
    context_flags: p.stat?.context_flags.map((c) => c.item) ?? [],
    page_on_call: p.stat?.page_on_call ?? false,
    state: p.state,
    arrived_at: p.header.arrived_at,
    has_draft: p.lightbox !== null,
    summary: p.stat?.worklist_reason ?? null,
  };
}

// The sort itself lives in src/lib/stat.ts: a plain sort on the visible columns.
export function sortWorklist(rows: WorklistRow[]): WorklistRow[] {
  return sortRows(rows);
}

export function getWorklist(): WorklistRow[] {
  const rows: WorklistRow[] = [];
  for (const id of listCaseIds()) {
    try {
      rows.push(toRow(getCasePayload(id) ?? notRunPayload(id)));
    } catch {
      // A folder whose case.json does not parse is still listed, with nothing assumed about it.
      rows.push({
        case_id: id, mock: false, tier: null, severity_subgroup: null, agreement_flag: null,
        patient: null, mrn: null, exam: null, views: { prior: "unknown", current: "unknown" },
        indication: null, indication_released_at: null, context_flags: [], page_on_call: false,
        state: "RECEIVED — case.json unreadable", arrived_at: null, has_draft: false, summary: null,
      });
    }
  }
  // The hand-written fixture is only listed while no real case has an AI draft.
  if (!rows.some((r) => r.has_draft)) rows.push(toRow(loadFixture()));
  return sortWorklist(rows);
}
