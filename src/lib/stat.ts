// Stat: the triage agent. Text only. It sees the merged findings, the indication and a
// slice of the chart. It never sees images. The worklist order is a plain sort in code.
import { MODELS } from "./config";
import { callModel, type CallMeta } from "./model";
import { statPrompt } from "./prompts";
import { StatOutput, type LightboxMerged, type SyntheticChart } from "./schemas";

export async function runStat(
  caseId: string, lightbox: LightboxMerged, chart: SyntheticChart
): Promise<{ data: StatOutput; meta: CallMeta }> {
  const input = {
    lightbox,
    indication: chart.indication,
    ehr_context: {
      _note: "SYNTHETIC in the demo, labelled as such in the UI",
      vitals: chart.vitals, labs: chart.labs, problem_list: chart.problem_list,
    },
    // Safety net fields (PCP, insurance, language, ordering site) are deliberately not sent:
    // they never enter the sort.
  };
  const result = await callModel({
    agent: "stat", label: "triage", caseId, model: MODELS.stat, system: statPrompt(),
    content: [{ type: "text", text: JSON.stringify(input) }], schema: StatOutput,
  });
  // The model proposes the page. Code decides: only tier critical pages the on-call radiologist.
  result.data.page_on_call = result.data.urgency_tier === "critical";
  return result;
}

export const TIER_ORDER = ["critical", "high", "routine"] as const;
export const SUBGROUP_ORDER = [
  "new_lesion_or_possible_new_diagnosis", "urgent_incidental", "progression_of_known_disease",
  "indeterminate_needs_human", "stable_or_responding",
] as const;
export const AGREEMENT_ORDER = ["reads_disagree", "one_of_two", "reads_agree"] as const;

export interface SortableRow {
  case_id: string;
  tier: string | null;
  severity_subgroup: string | null;
  agreement_flag: string | null;
  arrived_at: string | null;
}

const rank = (order: readonly string[], v: string | null) => {
  const i = v === null ? -1 : order.indexOf(v);
  return i === -1 ? order.length : i;
};

/**
 * Plain sort on visible columns, keys in the order given in agents/03_STAT_triage.md:
 * tier, severity subgroup, low agreement first, arrival (oldest first). No combined number.
 */
export function sortWorklist<T extends SortableRow>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      rank(TIER_ORDER, a.tier) - rank(TIER_ORDER, b.tier) ||
      rank(SUBGROUP_ORDER, a.severity_subgroup) - rank(SUBGROUP_ORDER, b.severity_subgroup) ||
      rank(AGREEMENT_ORDER, a.agreement_flag) - rank(AGREEMENT_ORDER, b.agreement_flag) ||
      (a.arrived_at ?? "9999").localeCompare(b.arrived_at ?? "9999") ||
      a.case_id.localeCompare(b.case_id)
  );
}
