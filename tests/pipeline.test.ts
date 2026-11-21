import { describe, it, expect } from "vitest";
import { reconcile, buildBlindPayload, sizeViolation } from "@/lib/lightbox";
import { fixtureBlind } from "@/lib/fixtures";
import { sortWorklist } from "@/lib/stat";
import { prompts } from "@/lib/prompts";
import type { CaseFile } from "@/lib/types";

describe("reconcile", () => {
  it("flags a finding seen on one read only and keeps it", () => {
    const m = reconcile(fixtureBlind("A_x", "A", "PA", "PA"), fixtureBlind("A_x", "B", "PA", "PA"));
    expect(m.findings.map((f) => f.agreement).sort()).toEqual(["1_of_2", "2_of_2"]);
    expect(m.findings.map((f) => f.id)).toEqual(["F1", "F2"]);
  });
  it("status disagreement becomes indeterminate and shows both reads", () => {
    const m = reconcile(fixtureBlind("B_x", "A", "PA", "PA"), fixtureBlind("B_x", "B", "PA", "PA"));
    expect(m.findings).toHaveLength(1);
    expect(m.findings[0]).toMatchObject({ agreement: "status_differs", status: "indeterminate", read_a_status: "stable", read_b_status: "increased" });
  });
  it("PA then AP: no size change is reported and the refusal survives", () => {
    const m = reconcile(fixtureBlind("D_x", "A", "PA", "AP"), fixtureBlind("D_x", "B", "PA", "AP"));
    expect(m.comparability.comparable).toBe("limited");
    expect(m.findings.every((f) => f.size_change_words === "not_comparable")).toBe(true);
    expect(m.cant_determine[0].recommend).toContain("CT chest");
  });
  it("uses the more cautious comparability when reads differ", () => {
    const a = fixtureBlind("E_x", "A", "PA", "PA"), b = fixtureBlind("E_x", "B", "PA", "PA");
    b.comparability.comparable = "no";
    const m = reconcile(a, b);
    expect(m.comparability.comparable).toBe("no");
    expect(m.study_flags).toContain("reads_disagree_on_comparability");
  });
  it("single read is labelled, not hidden", () => {
    const m = reconcile(fixtureBlind("A_x", "A", "PA", "PA"), null);
    expect(m.findings.every((f) => f.agreement === "single_read")).toBe(true);
  });
});

describe("firewall", () => {
  it("blind payload carries no indication, prior report or chart", () => {
    const c = { synthetic_chart: { indication: "SECRET-INDICATION", prior_report: "SECRET-REPORT", display_name: "N", mrn: "M" }, nih: { prior: { view: "PA" }, current: { view: "AP" } } } as unknown as CaseFile;
    const wire = JSON.stringify(buildBlindPayload(c, ["c1"]));
    expect(wire).not.toContain("SECRET");
    expect(wire).toContain("AP");
  });
  it("size and percent are rejected", () => {
    expect(sizeViolation({ a: "nodule measuring 12 mm" })).toBeTruthy();
    expect(sizeViolation({ a: "increased by 20%" })).toBeTruthy();
    expect(sizeViolation({ a: "larger" })).toBeNull();
  });
});

describe("worklist sort", () => {
  it("tier, then subgroup, then low agreement, then arrival. No blended score", () => {
    const r = (id: string, tier: "critical" | "high" | "routine" | null, subgroup: string | null, low: boolean, at: string) =>
      ({ id, tier, subgroup: subgroup as never, lowAgreement: low, arrived: at });
    const out = sortWorklist([
      r("routine", "routine", "stable_or_responding", false, "1"), r("high-prog", "high", "progression_of_known_disease", false, "1"),
      r("high-new-agree", "high", "new_lesion_or_possible_new_diagnosis", false, "2"), r("high-new-low", "high", "new_lesion_or_possible_new_diagnosis", true, "3"),
      r("crit", "critical", "urgent_incidental", false, "9"), r("pending", null, null, false, "0"),
    ]).map((x) => x.id);
    expect(out).toEqual(["crit", "high-new-low", "high-new-agree", "high-prog", "routine", "pending"]);
  });
});

describe("prompt loader", () => {
  it("extracts every agent prompt from the markdown", () => {
    for (const k of Object.keys(prompts) as (keyof typeof prompts)[]) expect(prompts[k]().length).toBeGreaterThan(200);
    expect(prompts.blind()).toContain("<reading_method>");
    expect(prompts.blind()).not.toContain("{{contents of READING_METHOD.md}}");
    expect(prompts.courierA()).toContain("AI DRAFT: requires resident review");
  });
});
