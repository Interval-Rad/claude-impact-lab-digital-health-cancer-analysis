import { describe, it, expect } from "vitest";
import { computeRecist } from "@/lib/recist";

describe("RECIST 1.1", () => {
  it("no measurements -> not computed", () => {
    const r = computeRecist([], { modality: "XR" });
    expect(r.category).toBe("not_computed");
    expect(r.line).toContain("RECIST 1.1: not computed. No confirmed measurements.");
  });
  it("20% and >=5mm increase -> progression", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 20, current_mm: 25 }], { modality: "CT_key_slice" });
    expect(r.category).toBe("progression");
    expect(r.pct_change).toBeCloseTo(25);
  });
  it("20% increase but under 5mm absolute -> stable", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 10, current_mm: 12 }], { modality: "CT_key_slice" });
    expect(r.category).toBe("stable");
  });
  it("any new lesion -> progression", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 20, current_mm: 20 }], { modality: "CT_key_slice", newLesion: true });
    expect(r.category).toBe("progression");
  });
  it("30% decrease -> partial response", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 30, current_mm: 20 }], { modality: "CT_key_slice" });
    expect(r.category).toBe("partial_response");
  });
  it("targets resolved (current 0) -> complete response", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 15, current_mm: 0 }], { modality: "CT_key_slice" });
    expect(r.category).toBe("complete_response");
  });
  it("sums multiple targets", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 10, current_mm: 10 }, { finding_id: "F2", prior_mm: 10, current_mm: 16 }], { modality: "CT_key_slice" });
    expect(r.prior_sum).toBe(20); expect(r.current_sum).toBe(26); expect(r.category).toBe("progression");
  });
  it("in-between -> stable", () => {
    expect(computeRecist([{ finding_id: "F1", prior_mm: 20, current_mm: 18 }], { modality: "CT_key_slice" }).category).toBe("stable");
  });
  it("radiograph results carry the estimate label", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: 20, current_mm: 25 }], { modality: "XR" });
    expect(r.line).toContain("estimate from radiograph. RECIST 1.1 expects CT.");
  });
  it("ignores incomplete measurements", () => {
    const r = computeRecist([{ finding_id: "F1", prior_mm: null, current_mm: 25 }], { modality: "XR" });
    expect(r.category).toBe("not_computed");
  });
});
