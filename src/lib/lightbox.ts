// Lightbox outside the blind read: what Charge passes into the blind read,
// reconciliation of the two reads (code), the focused pass (call 3), and code QC.
import type Anthropic from "@anthropic-ai/sdk";
import { loadCase, loadImage, toViewLabel } from "./cases";
import { MODELS } from "./config";
import { sniffMediaType } from "./images";
import { blindReadTwice, type BlindInput } from "./lightbox.blind";
import { callModel, type CallMeta } from "./model";
import { lightboxFocusedPrompt } from "./prompts";
import {
  FocusedPass, type BlindFinding, type BlindRead, type CaseFile, type Comparable, type LightboxMerged,
  type MergedCantDetermine, type MergedFinding,
} from "./schemas";

// ---------- the indication firewall ----------

/**
 * Everything the blind reads are allowed to receive from a case: two images and
 * their view labels. The chart, the dates, the prior report and the NIH labels stay behind.
 */
export function blindInputFromCase(c: CaseFile, priorBytes: Uint8Array, currentBytes: Uint8Array): BlindInput {
  return {
    modality: "XR",
    prior: { bytes: priorBytes, viewLabel: toViewLabel(c.prior.nih.view_position) },
    current: { bytes: currentBytes, viewLabel: toViewLabel(c.current.nih.view_position) },
  };
}

// ---------- reconciliation (code) ----------

const CAUTION: Record<Comparable, number> = { no: 0, limited: 1, yes: 2 };
const key = (f: { region: string; kind: string }) => `${f.region}|${f.kind}`;

function mergeFinding(a: BlindFinding | null, b: BlindFinding | null): Omit<MergedFinding, "id"> {
  const first = (a ?? b)!;
  const both = a !== null && b !== null;
  const sameStatus = both && a.status === b.status;
  return {
    region: first.region,
    kind: first.kind,
    description: first.description,
    // Reads disagree on the change: show both, work from "indeterminate".
    status: both && !sameStatus ? "indeterminate" : first.status,
    size_change_words: both && a.size_change_words !== b.size_change_words ? null : first.size_change_words,
    needs_measurement: Boolean(a?.needs_measurement || b?.needs_measurement),
    evidence: first.evidence,
    time_sensitive: Boolean(a?.time_sensitive || b?.time_sensitive),
    agreement: both ? (sameStatus ? "2_of_2" : "status_differs") : "1_of_2",
    read_a_status: a?.status ?? null,
    read_b_status: b?.status ?? null,
    reads: { a, b },
    added_in_focused_pass: false,
    outside_indication: null,
  };
}

/** Merges blind read A and blind read B. Keeps every finding from either read. */
export function reconcile(a: BlindRead, b: BlindRead): LightboxMerged {
  // Match on region + kind. When one read has several findings with the same region and kind
  // (two devices, say), pair each with the most similar one from the other read, not just the
  // next in line: a wrong pairing would show a disagreement the reads never had.
  const tokens = (f: BlindFinding) => new Set(f.description.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const similarity = (x: BlindFinding, y: BlindFinding) => {
    const tx = tokens(x), ty = tokens(y);
    const shared = [...tx].filter((t) => ty.has(t)).length;
    const union = new Set([...tx, ...ty]).size || 1;
    return shared / union + (x.status === y.status ? 0.25 : 0);
  };
  const unusedB = b.findings.map((f, i) => ({ f, i, used: false }));
  const merged: Omit<MergedFinding, "id">[] = [];
  for (const fa of a.findings) {
    const candidates = unusedB.filter((x) => !x.used && key(x.f) === key(fa));
    const match = candidates.sort((x, y) => similarity(fa, y.f) - similarity(fa, x.f) || x.i - y.i)[0];
    if (match) match.used = true;
    merged.push(mergeFinding(fa, match?.f ?? null));
  }
  for (const x of unusedB) if (!x.used) merged.push(mergeFinding(null, x.f));
  const findings: MergedFinding[] = merged.map((f, i) => ({ ...f, id: `F${i + 1}` }));

  // Union of the abstentions. Only an identical question from both reads counts once:
  // two different questions about the same region are both kept.
  const cant_determine: MergedCantDetermine[] = [];
  const add = (c: BlindRead["cant_determine"][number], read: "A" | "B") => {
    const question = c.question.trim().toLowerCase();
    const existing = cant_determine.find((x) => x.question.trim().toLowerCase() === question);
    if (existing) {
      if (!existing.from_reads.includes(read)) existing.from_reads.push(read);
      return;
    }
    const related = c.region !== "" && c.kind !== "" ? findings.find((f) => key(f) === key(c))?.id ?? null : null;
    cant_determine.push({ question: c.question, reason: c.reason, recommend: c.recommend, related_finding: related, from_reads: [read] });
  };
  a.cant_determine.forEach((c) => add(c, "A"));
  b.cant_determine.forEach((c) => add(c, "B"));

  const differs = a.comparability.comparable !== b.comparability.comparable;
  const cautious = CAUTION[b.comparability.comparable] < CAUTION[a.comparability.comparable] ? b : a;

  return {
    comparability: cautious.comparability,
    comparable_by_read: { a: a.comparability.comparable, b: b.comparability.comparable },
    systematic_read: cautious.systematic_read,
    findings,
    cant_determine,
    indication_pass: null,
    prior_report_discrepancies: [],
    look_first: [],
    study_flags: differs ? ["reads_disagree_on_comparability"] : [],
    limits: a.limits === b.limits ? a.limits : [a.limits, b.limits].filter(Boolean).join(" | "),
  };
}

// ---------- focused pass (call 3) ----------

export interface ReleasedContext {
  indication: string;
  ordering_provider: { name: string; role: string };
  prior_report: string;
}

export function buildFocusedContent(
  merged: LightboxMerged, priorBytes: Uint8Array, currentBytes: Uint8Array, released: ReleasedContext
): Anthropic.ContentBlockParam[] {
  const image = (bytes: Uint8Array): Anthropic.ImageBlockParam => ({
    type: "image",
    source: { type: "base64", media_type: sniffMediaType(bytes), data: Buffer.from(bytes).toString("base64") },
  });
  return [
    { type: "text", text: "PRIOR" },
    image(priorBytes),
    { type: "text", text: "CURRENT" },
    image(currentBytes),
    {
      type: "text",
      text: JSON.stringify({
        merged: { comparability: merged.comparability, findings: merged.findings, cant_determine: merged.cant_determine,
          study_flags: merged.study_flags, limits: merged.limits },
        indication: released.indication,
        ordering_provider: released.ordering_provider,
        prior_report: released.prior_report,
      }),
    },
  ];
}

/** Folds the focused pass into the merged read. Never deletes or downgrades a blind finding. */
export function applyFocused(merged: LightboxMerged, focused: FocusedPass): LightboxMerged {
  const outside = new Map(focused.outside_indication.map((o) => [o.finding_id, o.outside_indication]));
  const findings: MergedFinding[] = merged.findings.map((f) => ({ ...f, outside_indication: outside.get(f.id) ?? null }));
  focused.added_findings.forEach((f) => {
    const { added_in_focused_pass: _added, ...blind } = f;
    findings.push({
      ...blind, id: `F${findings.length + 1}`, agreement: null, read_a_status: null, read_b_status: null,
      reads: { a: null, b: null }, added_in_focused_pass: true, outside_indication: false,
    });
  });
  return {
    ...merged,
    findings,
    indication_pass: focused.indication_pass,
    prior_report_discrepancies: focused.prior_report_discrepancies,
    look_first: focused.look_first,
  };
}

export async function focusedPass(
  caseId: string, merged: LightboxMerged, priorBytes: Uint8Array, currentBytes: Uint8Array, released: ReleasedContext
): Promise<{ data: FocusedPass; meta: CallMeta }> {
  return callModel({
    agent: "lightbox", label: "focused", caseId, model: MODELS.lightbox, system: lightboxFocusedPrompt(),
    content: buildFocusedContent(merged, priorBytes, currentBytes, released), schema: FocusedPass,
    check: focusedProblems,
  });
}

// ---------- code QC (agents/01_CHARGE_orchestrator.md, "QC checks before DRAFTED") ----------

const MM_OR_PERCENT = /\b\d+(\.\d+)?\s*(mm|millimet(er|re)s?|cm|centimet(er|re)s?)\b|\d\s*%|\b\d+(\.\d+)?\s*percent\b/i;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

export interface CodeCheck { check: string; pass: boolean; detail: string }

/** Rules one blind read must meet on its own. A read that breaks one is sent back once. */
export function blindReadProblems(read: BlindRead): string[] {
  const problems: string[] = [];
  const sized = strings(read).filter((s) => MM_OR_PERCENT.test(s));
  if (sized.length) {
    problems.push(
      `Sizes in millimeters or centimeters and percents are not allowed anywhere in the output, including thresholds. Describe size in words. Offending text: ${sized.map((s) => `"${s.slice(0, 120)}"`).join(", ")}`
    );
  }
  if (read.comparability.comparable === "no" && read.findings.some((f) => f.status === "increased" || f.status === "decreased")) {
    problems.push('comparable is "no", so no finding may have status "increased" or "decreased"');
  }
  if (read.comparability.prior.view !== read.comparability.current.view &&
      read.findings.some((f) => ["larger", "smaller", "similar"].includes(f.size_change_words))) {
    problems.push('prior and current views differ, so every size_change_words must be "not_comparable" or "not_applicable"');
  }
  return problems;
}

/** The same idea for the focused pass: no sizes, no percents. */
export function focusedProblems(focused: FocusedPass): string[] {
  const sized = strings(focused).filter((s) => MM_OR_PERCENT.test(s));
  return sized.length
    ? [`Sizes in millimeters or centimeters and percents are not allowed. Offending text: ${sized.map((s) => `"${s.slice(0, 120)}"`).join(", ")}`]
    : [];
}

export function lightboxCodeChecks(a: BlindRead, b: BlindRead, merged: LightboxMerged, focused?: FocusedPass): CodeCheck[] {
  const checks: CodeCheck[] = [];
  const push = (check: string, problems: string[]) => checks.push({ check, pass: problems.length === 0, detail: problems.join("; ") });

  push("every finding has region, kind, status, evidence and agreement",
    merged.findings.filter((f) => !f.region || !f.kind || !f.status || !f.evidence.trim() || (!f.agreement && !f.added_in_focused_pass)).map((f) => f.id));

  push("no millimeter value or percent in Lightbox output",
    strings([a, b, focused ?? null]).filter((s) => MM_OR_PERCENT.test(s)).map((s) => `"${s.slice(0, 90)}"`));

  push("not comparable: no finding is called increased or decreased",
    merged.comparability.comparable === "no"
      ? merged.findings.filter((f) => f.status === "increased" || f.status === "decreased").map((f) => f.id) : []);

  const viewsDiffer = merged.comparability.prior.view !== merged.comparability.current.view;
  const sizeCalls = (f: MergedFinding) => [f.reads.a?.size_change_words, f.reads.b?.size_change_words, f.size_change_words]
    .some((w) => w === "larger" || w === "smaller" || w === "similar");
  push("views differ: no size change is reported", viewsDiffer ? merged.findings.filter(sizeCalls).map((f) => f.id) : []);

  const count = (fs: { region: string; kind: string }[]) => fs.reduce((m, f) => m.set(key(f), (m.get(key(f)) ?? 0) + 1), new Map<string, number>());
  const mergedCount = count(merged.findings.filter((f) => !f.added_in_focused_pass));
  const missing: string[] = [];
  for (const [read, fs] of [["A", a.findings], ["B", b.findings]] as const) {
    for (const [k, n] of count(fs)) if ((mergedCount.get(k) ?? 0) < n) missing.push(`read ${read}: ${k}`);
  }
  push("no finding from either blind read is missing after reconciliation", missing);

  const ids = new Set(merged.findings.map((f) => f.id));
  push("every look_first id exists", merged.look_first.filter((id) => !ids.has(id)));
  return checks;
}

// ---------- the three calls, in order ----------

export interface LightboxRun {
  case_id: string;
  blind: { a: BlindRead; b: BlindRead };
  merged: LightboxMerged;
  focused: FocusedPass | null;
  focused_skipped_reason: string | null;
  indication_released_at: string | null;
  code_checks: CodeCheck[];
  calls: CallMeta[];
}

export async function runLightbox(caseId: string, onStatus: (s: string) => void = () => {}): Promise<LightboxRun> {
  const c = loadCase(caseId);
  const prior = loadImage(caseId, "prior");
  const current = loadImage(caseId, "current");

  onStatus("Blind read A and blind read B running");
  const { a, b } = await blindReadTwice(caseId, blindInputFromCase(c, prior, current), blindReadProblems);
  onStatus("Reconciling the two reads");
  let merged = reconcile(a.data, b.data);
  const calls = [a.meta, b.meta];

  // The indication is released only now, after both blind reads are saved.
  const chart = c.synthetic_chart;
  let focused: FocusedPass | null = null;
  let released_at: string | null = null;
  let skipped: string | null = null;
  if (!chart.indication.trim()) {
    skipped = "No indication in the synthetic chart, so there is no clinical question to release. Focused pass not run.";
    onStatus(skipped);
  } else {
    released_at = new Date().toISOString();
    onStatus(`Indication released ${released_at}. Focused pass running`);
    const f = await focusedPass(caseId, merged, prior, current, {
      indication: chart.indication, ordering_provider: chart.ordering_provider, prior_report: chart.prior_report,
    });
    focused = f.data;
    calls.push(f.meta);
    merged = applyFocused(merged, focused);
  }

  return {
    case_id: caseId, blind: { a: a.data, b: b.data }, merged, focused, focused_skipped_reason: skipped,
    indication_released_at: released_at, code_checks: lightboxCodeChecks(a.data, b.data, merged, focused ?? undefined), calls,
  };
}
