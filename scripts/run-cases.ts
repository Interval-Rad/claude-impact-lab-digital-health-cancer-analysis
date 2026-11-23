// npm run cases            scorecard from the stored runs. Cases never run are run now
// npm run cases -- --rerun run every unsigned case again first (live model calls)
// Writes scorecard.md. Ground truth is never filled here: a case with no clinician
// label is reported as UNLABELLED and gets no score.
import fs from "node:fs";
import { loadEnv } from "./env";
import { listCaseIds, loadCase } from "../src/lib/cases";
import { loadState, RUNNING_STATES, startPipeline, type CaseState } from "../src/lib/charge";
import { assertModelsAvailable } from "../src/lib/model";

loadEnv();
const rerun = process.argv.includes("--rerun");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Truth { labeled_by?: string; findings?: { region?: string; status?: string }[]; should_refuse?: string[] }
const cell = (v: string | number) => String(v).replace(/\|/g, "/");

async function run(id: string): Promise<CaseState> {
  console.error(`${id}: running`);
  startPipeline(id);
  for (;;) {
    await sleep(1500);
    const s = loadState(id)!;
    if (s.state !== "RECEIVED" && !RUNNING_STATES.includes(s.state)) return s;
  }
}

async function main() {
  const ids = listCaseIds();
  const toRun = ids.filter((id) => { const s = loadState(id); return !s || (rerun && !s.signature.attending); });
  if (toRun.length) await assertModelsAvailable();
  const rows: string[] = [], problems: string[] = [];
  let labelled = 0, ran = 0, drafts = 0;
  for (const id of ids) {
    const s = toRun.includes(id) ? await run(id) : loadState(id)!;
    ran++;
    const truth = (loadCase(id).ground_truth ?? {}) as Truth;
    const isLabelled = Boolean(truth.labeled_by?.trim());
    const truthCell = isLabelled ? `labelled by ${cell(truth.labeled_by!)}` : "UNLABELLED";
    if (s.state === "NEEDS_HUMAN" || !s.lightbox) {
      problems.push(`${id}: stopped in NEEDS_HUMAN. ${s.error ?? ""}`);
      rows.push(`| ${id} | ${truthCell} | NEEDS_HUMAN, no AI draft | | | | | | |`);
      if (isLabelled) labelled++;
      continue;
    }
    drafts++;
    const f = s.lightbox.findings;
    const agreed = `${f.filter((x) => x.agreement === "2_of_2").length} of ${f.length}`;
    if (!isLabelled) { rows.push(`| ${id} | UNLABELLED | ${s.state} | | | | | ${agreed} | |`); continue; }
    labelled++;
    const truthFindings = (truth.findings ?? []).filter((t) => t.region);
    const caught = truthFindings.filter((t) => f.some((x) => x.region === t.region)).length;
    const falseFlags = f.filter((x) => x.status !== "stable" && !truthFindings.some((t) => t.region === x.region)).length;
    const refuse = truth.should_refuse ?? [];
    const refused = (r: string) => s.lightbox!.cant_determine.some((c) =>
      c.question.toLowerCase().includes(r.toLowerCase()) || f.some((x) => x.id === c.related_finding && x.region === r));
    const ok = refuse.filter(refused).length;
    rows.push(`| ${id} | ${truthCell} | ${s.state} | ${caught} of ${truthFindings.length} | ${falseFlags} | ${ok} | ${refuse.length - ok} | ${agreed} | |`);
  }
  const md = [
    "# Scorecard", "",
    `Generated ${new Date().toISOString()}.`, "",
    `- Cases run: ${ran}`, `- Cases with an AI draft: ${drafts}`, `- Cases stopped as NEEDS_HUMAN: ${ran - drafts}`,
    `- Cases labelled by a clinician: ${labelled}`, "",
    labelled === 0
      ? "No case has clinician ground truth, so there are no caught, false flag or refusal counts. Fill `ground_truth` in each `case.json` and run this again."
      : "Scores exist only for labelled cases. Matching is by region only.",
    "A smoke test, not a validation study.", "",
    "| Case | Ground truth | State | Caught | False flags | Correct refusals | Missed refusals | Reads agreed (2 of 2) | Would sign with minor edits |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows, "",
    ...(problems.length ? ["## Cases with no AI draft", "", ...problems.map((p) => `- ${p}`), ""] : []),
  ].join("\n");
  fs.writeFileSync("scorecard.md", md);
  console.log(md);
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
