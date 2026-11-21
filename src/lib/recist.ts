// RECIST 1.1 arithmetic. Pure function. Input is radiologist-entered
// measurements only, never model output.
//
// This compares two timepoints (prior and current). Full RECIST 1.1 measures
// progression against the nadir and response against baseline; with one prior
// study the prior stands in for both.

export type Modality = "XR" | "CT_key_slice";

export interface TargetMeasurement {
  finding_id: string;
  prior_mm: number | null;
  current_mm: number | null;
}

export type RecistCategory =
  | "not_computed"
  | "complete_response"
  | "partial_response"
  | "stable_disease"
  | "progressive_disease";

export interface RecistResult {
  category: RecistCategory;
  prior_sum_mm: number | null;
  current_sum_mm: number | null;
  change_mm: number | null;
  change_pct: number | null; // rounded to one decimal for display
  targets: string[]; // finding ids included in the sums
  reason: string;
  caveat: string | null; // set for radiographs
  line: string; // the report line
}

export const XR_CAVEAT = "estimate from radiograph. RECIST 1.1 expects CT.";
export const XR_NOT_COMPUTED_LINE = "RECIST 1.1: not computed on radiographs";
export const NOT_COMPUTED_LINE = "RECIST 1.1: not computed. No confirmed measurements.";

const LABEL: Record<Exclude<RecistCategory, "not_computed">, string> = {
  complete_response: "complete response",
  partial_response: "partial response",
  stable_disease: "stable disease",
  progressive_disease: "progressive disease",
};

function valid(n: number | null): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeRecist(input: {
  measurements: TargetMeasurement[];
  /** A radiologist confirmed a new lesion. Never set from unreviewed model output. */
  newLesion?: boolean;
  modality: Modality;
  /**
   * What to do with X-ray pairs. "not_computed" until a clinician confirms the
   * wording (agents/01_CHARGE_orchestrator.md). "estimate" computes and labels the result.
   */
  radiographPolicy?: "not_computed" | "estimate";
}): RecistResult {
  if (input.modality === "XR" && (input.radiographPolicy ?? "not_computed") === "not_computed") {
    return {
      category: "not_computed", prior_sum_mm: null, current_sum_mm: null, change_mm: null,
      change_pct: null, targets: [], reason: "RECIST is not computed on radiographs.", caveat: null,
      line: XR_NOT_COMPUTED_LINE,
    };
  }
  const caveat = input.modality === "XR" ? XR_CAVEAT : null;
  const withCaveat = (s: string) => (caveat ? `${s} (${caveat})` : s);
  const complete = input.measurements.filter((m) => valid(m.prior_mm) && valid(m.current_mm));
  const targets = complete.map((m) => m.finding_id);

  if (complete.length === 0 && !input.newLesion) {
    return {
      category: "not_computed", prior_sum_mm: null, current_sum_mm: null, change_mm: null,
      change_pct: null, targets: [], reason: "No confirmed measurements.", caveat: null,
      line: NOT_COMPUTED_LINE,
    };
  }

  const prior = round1(complete.reduce((s, m) => s + (m.prior_mm as number), 0));
  const current = round1(complete.reduce((s, m) => s + (m.current_mm as number), 0));
  const hasSums = complete.length > 0;
  const changeMm = hasSums ? round1(current - prior) : null;
  const rawPct = hasSums && prior > 0 ? ((current - prior) / prior) * 100 : null;
  const changePct = rawPct === null ? null : round1(rawPct);
  const sums = hasSums
    ? ` Sum of target diameters ${prior} mm prior, ${current} mm current` +
      (changePct === null ? "." : ` (${changeMm! >= 0 ? "+" : ""}${changeMm} mm, ${changePct >= 0 ? "+" : ""}${changePct}%).`)
    : "";

  const result = (category: Exclude<RecistCategory, "not_computed">, reason: string): RecistResult => ({
    category, prior_sum_mm: hasSums ? prior : null, current_sum_mm: hasSums ? current : null,
    change_mm: changeMm, change_pct: changePct, targets, reason, caveat,
    line: withCaveat(`RECIST 1.1: ${LABEL[category]}. ${reason}${sums}`),
  });

  if (input.newLesion) return result("progressive_disease", "New lesion confirmed by the radiologist.");

  if (prior === 0) {
    // No measurable disease on the prior: a percent change is undefined.
    if (current === 0) {
      return {
        category: "not_computed", prior_sum_mm: 0, current_sum_mm: 0, change_mm: 0, change_pct: null,
        targets, reason: "Target sums are zero on both studies.", caveat,
        line: withCaveat("RECIST 1.1: not computed. Target sums are zero on both studies."),
      };
    }
    return {
      category: "not_computed", prior_sum_mm: 0, current_sum_mm: current, change_mm: changeMm,
      change_pct: null, targets,
      reason: "Prior sum is zero, so percent change is undefined. If this is a new lesion, confirm it as new.",
      caveat,
      line: withCaveat(
        "RECIST 1.1: not computed. Prior sum is zero, so percent change is undefined. If this is a new lesion, confirm it as new."
      ),
    };
  }

  if (current === 0) return result("complete_response", "Target lesions resolved.");
  // Thresholds use the unrounded percent.
  if (rawPct! >= 20 && current - prior >= 5) {
    return result("progressive_disease", "Increase of 20 percent or more and at least 5 mm.");
  }
  if (rawPct! <= -30) return result("partial_response", "Decrease of 30 percent or more.");
  return result("stable_disease", "Neither the response nor the progression threshold is met.");
}
