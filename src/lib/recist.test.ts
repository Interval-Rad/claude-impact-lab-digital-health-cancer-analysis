import { describe, expect, it } from "vitest";
import { computeRecist, NOT_COMPUTED_LINE, XR_CAVEAT, XR_NOT_COMPUTED_LINE } from "./recist";

const m = (id: string, prior: number | null, current: number | null) => ({
  finding_id: id, prior_mm: prior, current_mm: current,
});

describe("computeRecist", () => {
  it("returns not computed when there are no measurements", () => {
    const r = computeRecist({ measurements: [], modality: "CT_key_slice" });
    expect(r.category).toBe("not_computed");
    expect(r.line).toBe(NOT_COMPUTED_LINE);
    expect(r.prior_sum_mm).toBeNull();
  });

  it("ignores half-entered measurements", () => {
    const r = computeRecist({ measurements: [m("F1", 20, null), m("F2", null, 12)], modality: "CT_key_slice" });
    expect(r.category).toBe("not_computed");
    expect(r.targets).toEqual([]);
  });

  it("sums target diameters across lesions", () => {
    const r = computeRecist({ measurements: [m("F1", 20, 22), m("F2", 10, 11), m("F3", 5, null)], modality: "CT_key_slice" });
    expect(r.prior_sum_mm).toBe(30);
    expect(r.current_sum_mm).toBe(33);
    expect(r.targets).toEqual(["F1", "F2"]);
    expect(r.change_pct).toBe(10);
    expect(r.category).toBe("stable_disease");
  });

  it("calls progression at exactly +20 percent and +5 mm", () => {
    const r = computeRecist({ measurements: [m("F1", 25, 30)], modality: "CT_key_slice" });
    expect(r.category).toBe("progressive_disease");
    expect(r.change_mm).toBe(5);
    expect(r.change_pct).toBe(20);
  });

  it("does not call progression when the increase is 20 percent but under 5 mm", () => {
    const r = computeRecist({ measurements: [m("F1", 10, 14)], modality: "CT_key_slice" });
    expect(r.change_pct).toBe(40);
    expect(r.category).toBe("stable_disease");
  });

  it("does not call progression when the increase is 5 mm but under 20 percent", () => {
    const r = computeRecist({ measurements: [m("F1", 50, 56)], modality: "CT_key_slice" });
    expect(r.category).toBe("stable_disease");
  });

  it("does not round 19.96 percent up into progression", () => {
    const r = computeRecist({ measurements: [m("F1", 50.1, 60.1)], modality: "CT_key_slice" });
    expect(r.category).toBe("stable_disease");
  });

  it("calls progression for a radiologist-confirmed new lesion, whatever the sums", () => {
    const shrinking = computeRecist({ measurements: [m("F1", 30, 15)], newLesion: true, modality: "CT_key_slice" });
    expect(shrinking.category).toBe("progressive_disease");
    const none = computeRecist({ measurements: [], newLesion: true, modality: "CT_key_slice" });
    expect(none.category).toBe("progressive_disease");
    expect(none.prior_sum_mm).toBeNull();
  });

  it("calls partial response at exactly -30 percent", () => {
    const r = computeRecist({ measurements: [m("F1", 20, 14)], modality: "CT_key_slice" });
    expect(r.category).toBe("partial_response");
    expect(r.change_pct).toBe(-30);
  });

  it("calls stable disease at -29 percent", () => {
    const r = computeRecist({ measurements: [m("F1", 100, 71)], modality: "CT_key_slice" });
    expect(r.category).toBe("stable_disease");
  });

  it("calls complete response when every target resolves", () => {
    const r = computeRecist({ measurements: [m("F1", 18, 0), m("F2", 9, 0)], modality: "CT_key_slice" });
    expect(r.category).toBe("complete_response");
  });

  it("does not compute a percent from a zero prior sum", () => {
    const r = computeRecist({ measurements: [m("F1", 0, 12)], modality: "CT_key_slice" });
    expect(r.category).toBe("not_computed");
    expect(r.change_pct).toBeNull();
  });

  it("rejects negative and non-finite values", () => {
    const r = computeRecist({ measurements: [m("F1", -5, 10), m("F2", NaN, 10)], modality: "CT_key_slice" });
    expect(r.category).toBe("not_computed");
  });

  it("labels radiograph results as an estimate", () => {
    const r = computeRecist({ measurements: [m("F1", 25, 30)], modality: "XR", radiographPolicy: "estimate" });
    expect(r.caveat).toBe(XR_CAVEAT);
    expect(r.line).toContain("estimate from radiograph. RECIST 1.1 expects CT.");
    const ct = computeRecist({ measurements: [m("F1", 25, 30)], modality: "CT_key_slice" });
    expect(ct.caveat).toBeNull();
    expect(ct.line).not.toContain("radiograph");
  });

  it("does not compute on radiographs until the wording is confirmed", () => {
    const r = computeRecist({ measurements: [m("F1", 25, 30)], newLesion: true, modality: "XR" });
    expect(r.category).toBe("not_computed");
    expect(r.line).toBe(XR_NOT_COMPUTED_LINE);
    expect(r.change_pct).toBeNull();
  });
});
