import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BlindRead, CaseFile, FocusedPass, StatOutput } from "./schemas";

const quality = {
  view: "PA", view_inferred: false, rotation: "none", inspiration: "adequate", exposure: "adequate",
  coverage: "complete", artifacts: [],
};
const read = {
  comparability: { prior: quality, current: { ...quality, view: "AP" }, comparable: "limited",
    differences: [{ factor: "projection", detail: "prior PA, current AP", prevents: "size comparison" }] },
  systematic_read: { airway_lungs: "", mediastinum_hila: "", pleura: "", heart: "", diaphragm_below: "",
    bones_soft_tissue: "", devices: "" },
  findings: [{ region: "R_upper", kind: "nodule_or_mass", description: "rounded opacity", status: "indeterminate",
    size_change_words: "not_comparable", needs_measurement: true, evidence: "seen on both", time_sensitive: false }],
  cant_determine: [{ question: "q", reason: "r", recommend: "CT chest", region: "R_upper", kind: "nodule_or_mass" }],
  limits: "single frontal view",
};

describe("schemas", () => {
  it("accepts a blind read in the spec shape", () => expect(BlindRead.safeParse(read).success).toBe(true));
  it("rejects a region outside the allowed list", () => {
    const bad = structuredClone(read);
    bad.findings[0].region = "right upper lobe";
    expect(BlindRead.safeParse(bad).success).toBe(false);
  });
  it("rejects a finding with no evidence field", () => {
    const bad = structuredClone(read) as { findings: Record<string, unknown>[] };
    delete bad.findings[0].evidence;
    expect(BlindRead.safeParse(bad).success).toBe(false);
  });
  it("converts to JSON Schema for tool definitions", () => {
    for (const s of [BlindRead, FocusedPass, StatOutput]) {
      const js = z.toJSONSchema(s) as { type?: string };
      expect(js.type).toBe("object");
    }
  });
  it("parses every case.json under data/cases", () => {
    const root = path.join(process.cwd(), "data", "cases");
    const ids = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "case.json"))) : [];
    for (const id of ids) {
      const parsed = CaseFile.safeParse(JSON.parse(fs.readFileSync(path.join(root, id, "case.json"), "utf8")));
      expect(parsed.success, `${id}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    }
  });
});

describe("fixtures/demo_case.json", () => {
  it("is tagged mock and its lightbox block matches the merged schema", async () => {
    const { LightboxMerged, StatOutput } = await import("./schemas");
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", "demo_case.json"), "utf8"));
    expect(fixture._mock).toBe(true);
    const merged = LightboxMerged.safeParse(fixture.lightbox);
    expect(merged.success, merged.success ? "" : merged.error.message).toBe(true);
    expect(StatOutput.safeParse(fixture.stat).success).toBe(true);
  });
});
