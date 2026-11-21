import { Stat, type StatT, type Merged } from "./schemas";
import { callTool, llmMode, MODELS, text } from "./llm";
import { prompts } from "./prompts";
import { fixtureStat } from "./fixtures";
import type { CaseFile, CaseState } from "./types";

export async function triage(c: CaseFile, merged: Merged) {
  if (llmMode() === "fixture") return { data: fixtureStat(c.category_hint, merged), model: "fixture" };
  // Stat sees findings, indication and chart. Never images.
  const input = { lightbox: merged, indication: c.synthetic_chart.indication,
    ehr_context: { _note: "SYNTHETIC in the demo", vitals: c.synthetic_chart.vitals, labs: c.synthetic_chart.labs, problem_list: c.synthetic_chart.problem_list } };
  const r = await callTool({ model: MODELS.sonnet, system: prompts.stat(), content: [text(JSON.stringify(input))], toolName: "return_triage", schema: Stat, maxTokens: 2000 });
  return { data: r.data, model: r.model };
}

/** Code sets the page. The model only proposes it. */
export const shouldPage = (s: StatT) => s.urgency_tier === "critical";

const TIER = { critical: 0, high: 1, routine: 2 } as const;
const SUB = { new_lesion_or_possible_new_diagnosis: 0, urgent_incidental: 1, progression_of_known_disease: 2, indeterminate_needs_human: 3, stable_or_responding: 4 } as const;

export type SortRow = { tier: keyof typeof TIER | null; subgroup: keyof typeof SUB | null; lowAgreement: boolean; arrived: string };
/** Plain sort on visible columns. No blended score. Untriaged rows sink in arrival order. */
export function sortWorklist<T extends SortRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const at = a.tier === null ? 9 : TIER[a.tier], bt = b.tier === null ? 9 : TIER[b.tier];
    if (at !== bt) return at - bt;
    const as = a.subgroup === null ? 9 : SUB[a.subgroup], bs = b.subgroup === null ? 9 : SUB[b.subgroup];
    if (as !== bs) return as - bs;
    if (a.lowAgreement !== b.lowAgreement) return a.lowAgreement ? -1 : 1;
    return a.arrived.localeCompare(b.arrived);
  });
}

export const lowAgreement = (s: CaseState) =>
  !!s.lightbox && (s.lightbox.study_flags.some((f) => f !== "single_read") || s.lightbox.findings.some((f) => f.agreement === "status_differs" || f.agreement === "1_of_2"));
