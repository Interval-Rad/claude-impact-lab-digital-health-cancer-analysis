// The one server-side loader the screens read from.
// Today: the hand-written fixture plus the real case folders (images only, nothing run).
// The main session replaces the bodies of getCasePayload and getWorklist with pipeline output.
// Server only: uses node:fs. Never import this from a "use client" file (import types from ./types).
import fs from "node:fs";
import path from "node:path";
import { assertCaseId, listCaseIds, loadCase, toViewLabel } from "@/lib/cases";
import { BANNER } from "@/lib/config";
import type { CasePayload, WorklistRow } from "./types";

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

/** Returns null when the id is malformed or no such case exists. */
export function getCasePayload(id: string): CasePayload | null {
  if (id === FIXTURE_ID) return loadFixture();
  try {
    assertCaseId(id);
    return notRunPayload(id);
  } catch {
    return null;
  }
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
    tier: p.stat?.urgency_tier ?? null,
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
  };
}

const TIER_ORDER = ["critical", "high", "routine"];
const SUBGROUP_ORDER = [
  "new_lesion_or_possible_new_diagnosis",
  "urgent_incidental",
  "progression_of_known_disease",
  "indeterminate_needs_human",
  "stable_or_responding",
];
const AGREEMENT_ORDER = ["reads_disagree", "one_of_two", "reads_agree"];

const rank = (order: string[], v: string | null) => {
  const i = v === null ? -1 : order.indexOf(v);
  return i === -1 ? order.length : i;
};

// Plain sort on the visible columns, keys in the order given in agents/03_STAT_triage.md:
// tier, severity subgroup, low agreement first, arrival (oldest first). Rows not run yet go last.
export function sortWorklist(rows: WorklistRow[]): WorklistRow[] {
  return [...rows].sort(
    (a, b) =>
      rank(TIER_ORDER, a.tier) - rank(TIER_ORDER, b.tier) ||
      rank(SUBGROUP_ORDER, a.severity_subgroup) - rank(SUBGROUP_ORDER, b.severity_subgroup) ||
      rank(AGREEMENT_ORDER, a.agreement_flag) - rank(AGREEMENT_ORDER, b.agreement_flag) ||
      (a.arrived_at ?? "9999").localeCompare(b.arrived_at ?? "9999") ||
      a.case_id.localeCompare(b.case_id)
  );
}

export function getWorklist(): WorklistRow[] {
  const rows: WorklistRow[] = [toRow(loadFixture())];
  for (const id of listCaseIds()) {
    try {
      rows.push(toRow(notRunPayload(id)));
    } catch {
      // A folder whose case.json does not parse is still listed, with nothing assumed about it.
      rows.push({
        case_id: id, mock: false, tier: null, severity_subgroup: null, agreement_flag: null,
        patient: null, mrn: null, exam: null, views: { prior: "unknown", current: "unknown" },
        indication: null, indication_released_at: null, context_flags: [], page_on_call: false,
        state: "RECEIVED — case.json unreadable", arrived_at: null, has_draft: false,
      });
    }
  }
  return sortWorklist(rows);
}
