import { describe, expect, it } from "vitest";
import { applyFocused, lightboxCodeChecks, reconcile } from "./lightbox";
import type { BlindFinding, BlindRead } from "./schemas";

const quality = (view: "PA" | "AP") => ({
  view, view_inferred: false, rotation: "none" as const, inspiration: "adequate" as const,
  exposure: "adequate" as const, coverage: "complete" as const, artifacts: [],
});
const finding = (over: Partial<BlindFinding> = {}): BlindFinding => ({
  region: "R_upper", kind: "nodule_or_mass", description: "rounded opacity", status: "new",
  size_change_words: "not_applicable", needs_measurement: true, evidence: "seen on current, not on prior",
  time_sensitive: false, ...over,
});
const read = (over: Partial<BlindRead> = {}, comparable: "yes" | "limited" | "no" = "yes"): BlindRead => ({
  comparability: { prior: quality("PA"), current: quality("PA"), comparable, differences: [] },
  systematic_read: { airway_lungs: "", mediastinum_hila: "", pleura: "", heart: "", diaphragm_below: "", bones_soft_tissue: "", devices: "" },
  findings: [], cant_determine: [], limits: "single frontal view", ...over,
});

describe("reconcile", () => {
  it("marks a finding in both reads with the same status as 2_of_2", () => {
    const m = reconcile(read({ findings: [finding()] }), read({ findings: [finding()] }));
    expect(m.findings).toHaveLength(1);
    expect(m.findings[0]).toMatchObject({ id: "F1", agreement: "2_of_2", status: "new", read_a_status: "new", read_b_status: "new" });
  });

  it("sets the working status to indeterminate when the reads disagree, and keeps both", () => {
    const m = reconcile(read({ findings: [finding({ status: "new" })] }), read({ findings: [finding({ status: "stable" })] }));
    expect(m.findings[0]).toMatchObject({ agreement: "status_differs", status: "indeterminate", read_a_status: "new", read_b_status: "stable" });
  });

  it("never deletes a finding seen on one read only", () => {
    const effusion = finding({ region: "L_pleura", kind: "effusion" });
    const m = reconcile(read({ findings: [finding()] }), read({ findings: [effusion] }));
    expect(m.findings.map((f) => [f.id, f.kind, f.agreement, f.read_a_status, f.read_b_status])).toEqual([
      ["F1", "nodule_or_mass", "1_of_2", "new", null],
      ["F2", "effusion", "1_of_2", null, "new"],
    ]);
  });

  it("pairs two findings with the same region and kind in order, without dropping one", () => {
    const m = reconcile(read({ findings: [finding(), finding({ status: "stable" })] }), read({ findings: [finding()] }));
    expect(m.findings.map((f) => f.agreement)).toEqual(["2_of_2", "1_of_2"]);
  });

  it("uses the more cautious comparability and flags the disagreement", () => {
    const m = reconcile(read({}, "yes"), read({}, "limited"));
    expect(m.comparability.comparable).toBe("limited");
    expect(m.study_flags).toEqual(["reads_disagree_on_comparability"]);
    expect(m.comparable_by_read).toEqual({ a: "yes", b: "limited" });
    expect(reconcile(read(), read()).study_flags).toEqual([]);
  });

  it("unions the abstentions and links them to a finding", () => {
    const q = { question: "Has the nodule changed in size?", reason: "PA then AP", recommend: "CT chest", region: "R_upper", kind: "nodule_or_mass" };
    const other = { question: "Has the heart enlarged?", reason: "AP magnifies", recommend: "Repeat PA", region: "heart", kind: "cardiac_silhouette" };
    const m = reconcile(read({ findings: [finding()], cant_determine: [q] }), read({ findings: [finding()], cant_determine: [{ ...q, question: "Nodule size change?" }, other] }));
    expect(m.cant_determine).toHaveLength(2);
    expect(m.cant_determine[0]).toMatchObject({ related_finding: "F1", from_reads: ["A", "B"] });
    expect(m.cant_determine[1]).toMatchObject({ related_finding: null, from_reads: ["B"] });
  });

  it("raises needs_measurement and time_sensitive if either read set them", () => {
    const m = reconcile(read({ findings: [finding({ time_sensitive: false, needs_measurement: false })] }), read({ findings: [finding({ time_sensitive: true, needs_measurement: true })] }));
    expect(m.findings[0]).toMatchObject({ time_sensitive: true, needs_measurement: true });
  });
});

describe("applyFocused", () => {
  const merged = reconcile(read({ findings: [finding()] }), read({ findings: [finding()] }));
  const focused = {
    indication_pass: { question: "Progression?", answer: "A new opacity is present.", regions_rechecked: ["R_upper"] },
    added_findings: [{ ...finding({ region: "L_hilum", kind: "adenopathy" }), added_in_focused_pass: true as const }],
    prior_report_discrepancies: [], outside_indication: [{ finding_id: "F1", outside_indication: false }], look_first: ["F1"],
  };
  it("adds focused findings without touching the blind ones", () => {
    const out = applyFocused(merged, focused);
    expect(out.findings[0]).toMatchObject({ id: "F1", agreement: "2_of_2", status: "new", outside_indication: false });
    expect(out.findings[1]).toMatchObject({ id: "F2", added_in_focused_pass: true, agreement: null });
    expect(out.look_first).toEqual(["F1"]);
  });
});

describe("lightboxCodeChecks", () => {
  const failed = (a: BlindRead, b: BlindRead) => lightboxCodeChecks(a, b, reconcile(a, b)).filter((c) => !c.pass).map((c) => c.check);
  it("passes a clean pair of reads", () => expect(failed(read({ findings: [finding()] }), read({ findings: [finding()] }))).toEqual([]));
  it("fails on a millimeter value", () => {
    expect(failed(read({ findings: [finding({ description: "a 14 mm nodule" })] }), read())).toContain("no millimeter value or percent in Lightbox output");
  });
  it("fails on a percent", () => {
    expect(failed(read({ findings: [finding({ evidence: "about 30% larger" })] }), read())).toContain("no millimeter value or percent in Lightbox output");
  });
  it("fails when a size change is reported across different views", () => {
    const pa_ap = (f: BlindFinding[]): BlindRead => ({ ...read({ findings: f }, "limited"),
      comparability: { prior: quality("PA"), current: quality("AP"), comparable: "limited", differences: [] } });
    expect(failed(pa_ap([finding({ size_change_words: "larger" })]), pa_ap([finding({ size_change_words: "not_comparable" })])))
      .toContain("views differ: no size change is reported");
  });
  it("fails when not comparable but a finding is called increased", () => {
    expect(failed(read({ findings: [finding({ status: "increased" })] }, "no"), read({ findings: [finding({ status: "increased" })] }, "no")))
      .toContain("not comparable: no finding is called increased or decreased");
  });
});
