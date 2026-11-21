import fs from "fs";
import path from "path";
import { BlindRead, Focused, type BlindReadT, type BlindFindingT, type FocusedT, type Merged, type MergedFinding } from "./schemas";
import { callTool, llmMode, MODELS, png, text, type Block } from "./llm";
import { prompts } from "./prompts";
import { caseDir } from "./store";
import { fixtureBlind, fixtureFocused } from "./fixtures";
import type { CaseFile } from "./types";

export type BlindPayload = {
  modality: "XR"; prior: { view_label: string }; current: { view_label: string }; corrections: string[];
};

const b64 = (id: string, which: "prior" | "current") => fs.readFileSync(path.join(caseDir(id), `${which}.png`)).toString("base64");
const ORDER: Record<string, number> = { no: 0, limited: 1, yes: 2 };

/** Strings the model must never produce: millimeter values and percents. */
const SIZE_RE = /\d+(\.\d+)?\s*(mm|cm|millimet|centimet)|%|percent/i;
export function sizeViolation(o: unknown): string | null {
  const hit = JSON.stringify(o).match(SIZE_RE);
  return hit ? `Output contains a size or percent ("${hit[0]}"). Describe size change in words only.` : null;
}

function readChecks(r: BlindReadT, priorView: string, currentView: string): string | null {
  const sz = sizeViolation(r); if (sz) return sz;
  if (r.comparability.comparable === "no" && r.findings.some((f) => f.status === "increased" || f.status === "decreased"))
    return "comparable is 'no' but a finding is marked increased or decreased.";
  if (priorView !== currentView && r.findings.some((f) => f.size_change_words !== "not_comparable" && f.size_change_words !== "not_applicable"))
    return "Prior and current views differ, so every size_change_words must be not_comparable or not_applicable.";
  return null;
}

/** Calls 1 and 2. The payload is built here from allowed fields only. No indication, no prior report, no chart. */
export function buildBlindPayload(c: CaseFile, corrections: string[]): BlindPayload {
  return { modality: "XR", prior: { view_label: c.nih.prior.view || "unknown" }, current: { view_label: c.nih.current.view || "unknown" }, corrections: corrections.slice(0, 5) };
}

export async function blindRead(id: string, c: CaseFile, payload: BlindPayload, which: "A" | "B"): Promise<{ data: BlindReadT; model: string; fellBack: boolean }> {
  if (llmMode() === "fixture") return { data: fixtureBlind(c.category_hint, which, payload.prior.view_label, payload.current.view_label), model: "fixture", fellBack: false };
  const content: Block[] = [
    text("PRIOR"), png(b64(id, "prior")), text("CURRENT"), png(b64(id, "current")),
    text(JSON.stringify(payload)),
  ];
  return callTool({
    model: MODELS.lightbox, fallbackModel: MODELS.lightboxFallback, system: prompts.blind(), content,
    toolName: "return_blind_read", schema: BlindRead, maxTokens: 10000,
    refine: (r) => readChecks(r, payload.prior.view_label, payload.current.view_label),
  });
}

/** Reconcile in code. Keep every finding. Disagreement never deletes one. */
export function reconcile(a: BlindReadT | null, b: BlindReadT | null): Merged {
  const reads = [a, b].filter(Boolean) as BlindReadT[];
  if (reads.length === 0) throw new Error("no reads to reconcile");
  const single = reads.length === 1;
  const flags: string[] = [];
  if (single) flags.push("single_read");

  let comparable = reads[0].comparability.comparable;
  if (reads.length === 2 && a!.comparability.comparable !== b!.comparability.comparable) {
    flags.push("reads_disagree_on_comparability");
    comparable = ORDER[a!.comparability.comparable] <= ORDER[b!.comparability.comparable] ? a!.comparability.comparable : b!.comparability.comparable;
  }
  const base = a ?? reads[0];
  const differences = [...base.comparability.differences];
  if (b && a) for (const d of b.comparability.differences) if (!differences.some((x) => x.factor === d.factor && x.detail === d.detail)) differences.push(d);

  const key = (f: BlindFindingT) => `${f.region}|${f.kind}`;
  const group = (r: BlindReadT | null) => {
    const m = new Map<string, BlindFindingT[]>();
    for (const f of r?.findings ?? []) m.set(key(f), [...(m.get(key(f)) ?? []), f]);
    return m;
  };
  const ga = group(a), gb = group(b);
  const keys = [...new Set([...ga.keys(), ...gb.keys()])];
  const findings: MergedFinding[] = [];
  for (const k of keys) {
    const la = ga.get(k) ?? [], lb = gb.get(k) ?? [];
    for (let i = 0; i < Math.max(la.length, lb.length); i++) {
      const fa = la[i], fb = lb[i], f = (fa ?? fb)!;
      let agreement: MergedFinding["agreement"]; let status = f.status; let words = f.size_change_words;
      if (single) agreement = "single_read";
      else if (fa && fb) {
        if (fa.status === fb.status) agreement = "2_of_2";
        else { agreement = "status_differs"; status = "indeterminate"; words = "not_comparable"; }
      } else agreement = "1_of_2";
      findings.push({
        ...f, status, size_change_words: words, time_sensitive: !!(fa?.time_sensitive || fb?.time_sensitive),
        needs_measurement: !!(fa?.needs_measurement || fb?.needs_measurement), id: "",
        agreement, read_a_status: fa?.status ?? null, read_b_status: fb?.status ?? null, added_in_focused_pass: false, outside_indication: false,
      });
    }
  }
  findings.forEach((f, i) => (f.id = `F${i + 1}`));

  const cants: Merged["cant_determine"] = [];
  for (const r of reads) for (const c of r.cant_determine) {
    if (cants.some((x) => x.question === c.question)) continue;
    const rel = findings.find((f) => f.region === c.region && f.kind === c.kind)?.id ?? findings.find((f) => f.region === c.region)?.id ?? null;
    cants.push({ question: c.question, reason: c.reason, recommend: c.recommend, related_finding: rel });
  }
  return {
    comparability: { ...base.comparability, comparable, differences }, systematic_read: base.systematic_read,
    findings, cant_determine: cants, indication_pass: null, prior_report_discrepancies: [], look_first: [],
    study_flags: flags, limits: [...new Set(reads.map((r) => r.limits))].join(" "),
  };
}

/** Call 3. Receives the merged read plus the indication and prior report that Charge held back. */
export async function focusedPass(id: string, c: CaseFile, merged: Merged, indication: { indication: string; ordering_provider: CaseFile["synthetic_chart"]["ordering_provider"]; prior_report: string }) {
  if (llmMode() === "fixture") return { data: fixtureFocused(c.category_hint, merged), model: "fixture", fellBack: false };
  const content: Block[] = [
    text("PRIOR"), png(b64(id, "prior")), text("CURRENT"), png(b64(id, "current")),
    text(JSON.stringify({ merged, ...indication })),
  ];
  return callTool({
    model: MODELS.lightbox, fallbackModel: MODELS.lightboxFallback, system: prompts.focused(), content,
    toolName: "return_focused_pass", schema: Focused, maxTokens: 6000, refine: (r) => sizeViolation(r),
  });
}

/** Apply the focused pass without deleting or downgrading anything from the blind reads. */
export function applyFocused(merged: Merged, f: FocusedT): Merged {
  const out: Merged = JSON.parse(JSON.stringify(merged));
  let n = out.findings.length;
  for (const add of f.added_findings) {
    n++;
    out.findings.push({ ...add, id: `F${n}`, agreement: "1_of_2", read_a_status: null, read_b_status: null, added_in_focused_pass: true, outside_indication: false });
  }
  for (const fd of out.findings) fd.outside_indication = !!f.outside_indication[fd.id];
  out.indication_pass = f.indication_pass;
  out.prior_report_discrepancies = f.prior_report_discrepancies;
  out.look_first = f.look_first.filter((id) => out.findings.some((x) => x.id === id));
  return out;
}
