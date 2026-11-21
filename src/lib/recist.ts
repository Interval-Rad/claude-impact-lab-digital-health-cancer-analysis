// RECIST 1.1 arithmetic. Pure function. Input comes only from radiologist-entered measurements.
export type Measurement = { finding_id: string; prior_mm: number | null; current_mm: number | null };
export type RecistCategory = "not_computed" | "progression" | "partial_response" | "complete_response" | "stable";
export type RecistResult = {
  category: RecistCategory;
  prior_sum: number | null;
  current_sum: number | null;
  pct_change: number | null;
  abs_change_mm: number | null;
  line: string;
};

const LABEL: Record<RecistCategory, string> = {
  not_computed: "not computed",
  progression: "progressive disease",
  partial_response: "partial response",
  complete_response: "complete response",
  stable: "stable disease",
};

export function computeRecist(
  measurements: Measurement[],
  opts: { modality: "XR" | "CT_key_slice"; newLesion?: boolean },
): RecistResult {
  const valid = measurements.filter(
    (m) => typeof m.prior_mm === "number" && typeof m.current_mm === "number" && m.prior_mm >= 0 && m.current_mm >= 0,
  );
  if (valid.length === 0) {
    return {
      category: "not_computed", prior_sum: null, current_sum: null, pct_change: null, abs_change_mm: null,
      line: "RECIST 1.1: not computed. No confirmed measurements.",
    };
  }
  const prior = valid.reduce((s, m) => s + (m.prior_mm as number), 0);
  const current = valid.reduce((s, m) => s + (m.current_mm as number), 0);
  const abs = current - prior;
  const pct = prior > 0 ? (abs / prior) * 100 : null;

  let category: RecistCategory;
  if (opts.newLesion) category = "progression";
  else if (current === 0) category = "complete_response";
  else if (pct !== null && pct >= 20 && abs >= 5) category = "progression";
  else if (pct !== null && pct <= -30) category = "partial_response";
  else category = "stable";

  const r1 = (n: number) => Math.round(n * 10) / 10;
  let line = `RECIST 1.1: ${LABEL[category]}. Sum of target diameters ${r1(prior)} mm to ${r1(current)} mm`;
  if (pct !== null) line += ` (${pct >= 0 ? "+" : ""}${r1(pct)}%)`;
  if (opts.newLesion) line += ", new lesion present";
  line += ".";
  if (opts.modality === "XR") line += " (estimate from radiograph. RECIST 1.1 expects CT.)";
  return { category, prior_sum: r1(prior), current_sum: r1(current), pct_change: pct === null ? null : r1(pct), abs_change_mm: r1(abs), line };
}
