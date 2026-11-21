// FIXTURE MODE. Used only when no ANTHROPIC_API_KEY is set. Output here is SCRIPTED by scenario
// (the NIH category letter). It is not a read of the images. The UI says so on every screen.
import type { BlindReadT, BlindFindingT, FocusedT, Merged, StatT } from "./schemas";

export const FIXTURE_NOTICE = "FIXTURE MODE: scripted output for demo. Not a read of these images.";

const side = (view: string) => ({
  view: (["PA", "AP"].includes(view) ? view : "unknown") as "PA" | "AP" | "unknown", view_inferred: false,
  rotation: "none" as const, inspiration: "adequate" as const, exposure: "adequate" as const, coverage: "complete" as const,
  artifacts: view === "AP" ? ["portable technique"] : [],
});

type F = Partial<BlindFindingT> & Pick<BlindFindingT, "region" | "kind" | "status" | "description">;
const mk = (f: F, differ: boolean): BlindFindingT => ({
  size_change_words: differ ? "not_comparable" : "not_applicable", needs_measurement: f.kind === "nodule_or_mass",
  evidence: "Scripted demo evidence. Replace with the model's description of what the image shows.", time_sensitive: false, ...f,
});

export function fixtureBlind(category: string, which: "A" | "B", pv: string, cv: string): BlindReadT {
  const sc = category[0], differ = pv !== cv;
  let findings: BlindFindingT[] = [];
  const cants: BlindReadT["cant_determine"] = [];
  const nod = (status: BlindFindingT["status"], region: BlindFindingT["region"] = "R_upper", words?: BlindFindingT["size_change_words"]) =>
    mk({ region, kind: "nodule_or_mass", status, description: "rounded opacity", size_change_words: differ ? "not_comparable" : (words ?? "not_applicable") }, differ);
  switch (sc) {
    case "A": findings = [nod("new"), ...(which === "B" ? [mk({ region: "L_hilum", kind: "adenopathy", status: "indeterminate", description: "possible fullness" }, differ)] : [])]; break;
    case "B": findings = which === "A" ? [nod("stable", "R_mid", "similar")] : [nod("increased", "R_mid", "larger")]; break;
    case "C": findings = [nod("resolved", "R_mid", "smaller")]; break;
    case "D":
      findings = [nod("indeterminate", "R_upper"), ...(which === "B" ? [mk({ region: "heart", kind: "cardiac_silhouette", status: "indeterminate", description: "silhouette appears larger on AP" }, true)] : [])];
      cants.push({ question: "Has the right upper zone nodule changed in size?", region: "R_upper", kind: "nodule_or_mass",
        reason: "Prior is an upright PA film. Current is a portable AP film. AP projection magnifies and blurs structures. Projection alone accounts for the apparent increase.",
        recommend: "CT chest to measure the nodule." });
      break;
    case "F": findings = [nod("stable", "R_mid", "similar"), mk({ region: "R_pleura", kind: "effusion", status: "new", description: "new blunting of the costophrenic angle", time_sensitive: true }, differ)]; break;
    default: findings = [];
  }
  const text = (s: string) => `${s} (scripted)`;
  return {
    comparability: {
      prior: side(pv), current: side(cv), comparable: differ ? "limited" : "yes",
      differences: differ ? [{ factor: "projection", detail: `prior ${pv}, current ${cv}`, prevents: "size comparison of any lesion, heart size comparison" }] : [],
    },
    systematic_read: {
      airway_lungs: text("Trachea midline. Lungs read per findings"), mediastinum_hila: text("Mediastinum within normal limits"), pleura: text("No pneumothorax"),
      heart: text("Heart size not otherwise remarkable"), diaphragm_below: text("No free gas seen"), bones_soft_tissue: text("No acute osseous abnormality"), devices: text("None"),
    },
    findings, cant_determine: cants, limits: `Single frontal view, no lateral. ${FIXTURE_NOTICE}`,
  };
}

export function fixtureFocused(category: string, m: Merged): FocusedT {
  const outside: Record<string, boolean> = {};
  for (const f of m.findings) outside[f.id] = category[0] === "D" ? f.kind === "cardiac_silhouette" : f.kind === "adenopathy";
  const urgent = m.findings.filter((f) => f.time_sensitive).map((f) => f.id);
  const first = m.findings.find((f) => f.kind === "nodule_or_mass")?.id;
  return {
    indication_pass: { question: "Scripted: does the study answer the order's clinical question?", answer: `Scripted answer. ${FIXTURE_NOTICE}`, regions_rechecked: [...new Set(m.findings.map((f) => f.region))] },
    added_findings: [], prior_report_discrepancies: [], outside_indication: outside,
    look_first: urgent.length ? urgent : first ? [first] : [],
  };
}

export function fixtureStat(category: string, m: Merged): StatT {
  const sc = category[0];
  const base = { page_on_call: false, context_flags: [] as StatT["context_flags"] };
  switch (sc) {
    case "A": return { ...base, severity_subgroup: "new_lesion_or_possible_new_diagnosis", urgency_tier: "high", worklist_reason: "New right upper zone opacity since prior. One extra finding on one read only." };
    case "B": return { ...base, severity_subgroup: "indeterminate_needs_human", urgency_tier: "high", worklist_reason: "Reads disagree on change in the right mid zone nodule." };
    case "C": return { ...base, severity_subgroup: "stable_or_responding", urgency_tier: "routine", worklist_reason: "Prior right mid zone nodule not seen now. Confirm by eye." };
    case "D": return { ...base, severity_subgroup: "indeterminate_needs_human", urgency_tier: "high", worklist_reason: "PA then AP. Size change cannot be judged. CT recommended." };
    case "F": {
      const eff = m.findings.find((f) => f.kind === "effusion")?.id ?? "F2";
      return { severity_subgroup: "urgent_incidental", urgency_tier: "critical", page_on_call: true,
        context_flags: [{ item: "SpO2 91%", bears_on: eff, why: "new pleural effusion with low oxygen saturation" }],
        worklist_reason: "New right pleural effusion with SpO2 91 percent and new dyspnea." };
    }
    default: return { ...base, severity_subgroup: "stable_or_responding", urgency_tier: "routine", worklist_reason: "No change called. Reads agree." };
  }
}
