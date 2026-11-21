import { describe, expect, it } from "vitest";
import {
  chargeQcPrompt, courierHandoffPrompt, courierReportPrompt, extractFencedBlock, lightboxBlindPrompt,
  lightboxFocusedPrompt, statPrompt,
} from "./prompts";

describe("extractFencedBlock", () => {
  const md = ["# T", "## A", "text", "```", "alpha", "```", "## B", "no fence", "## C", "```json", "{}", "```"].join("\n");
  it("returns the block under the heading", () => expect(extractFencedBlock(md, "A")).toBe("alpha"));
  it("does not borrow a block from a later heading", () => expect(() => extractFencedBlock(md, "B")).toThrow(/no fenced block/));
  it("throws on a missing heading", () => expect(() => extractFencedBlock(md, "Z")).toThrow(/not found/));
});

describe("agent prompts load from agents/*.md", () => {
  it("blind read prompt has the reading method spliced in", () => {
    const p = lightboxBlindPrompt();
    expect(p.startsWith("You are Lightbox, the first-read agent")).toBe(true);
    expect(p).not.toContain("{{contents of READING_METHOD.md}}");
    expect(p).toContain("### 1.2 Technical quality (RIPE)");
    expect(p).toContain("Return JSON only, matching the schema.");
  });
  it("focused pass prompt", () => expect(lightboxFocusedPrompt()).toMatch(/^You are Lightbox, on your focused pass\./));
  it("QC prompt", () => expect(chargeQcPrompt()).toMatch(/^You are Charge, the quality check/));
  it("Stat prompt", () => expect(statPrompt()).toMatch(/^You are Stat, the worklist triage agent/));
  it("Courier mode A prompt ends with the fixed last line", () => {
    const p = courierReportPrompt();
    expect(p).toMatch(/^You are Courier, the report writer/);
    expect(p.endsWith("AI DRAFT: requires resident review and attending signature.")).toBe(true);
  });
  it("Courier mode B prompt", () => expect(courierHandoffPrompt()).toMatch(/^You are Courier in handoff mode\./));
});
