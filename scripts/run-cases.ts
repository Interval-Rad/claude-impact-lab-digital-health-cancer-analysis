// npm run cases
// Runs Lightbox on every case in data/cases/, writes lightbox.json per case and scorecard.md.
// Ground truth is never filled here. A case with no clinician label is reported as UNLABELLED.
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";
import { caseDir, listCaseIds, loadCase } from "../src/lib/cases";
import { runLightbox, type LightboxRun } from "../src/lib/lightbox";
import { assertModelsAvailable } from "../src/lib/model";

loadEnv();

interface Truth {
  labeled_by?: string;
  findings?: { region?: string; status?: string }[];
  should_refuse?: string[];
}
const cell = (v: string | number) => String(v).replace(/\|/g, "/");

async function main() {
  await assertModelsAvailable();
  const rows: string[] = [];
  const errors: string[] = [];
  let labelled = 0, ran = 0;
  for (const id of listCaseIds()) {
    let run: LightboxRun;
    try {
      console.error(`${id}: running`);
      run = await runLightbox(id);
      fs.writeFileSync(path.join(caseDir(id), "lightbox.json"), JSON.stringify(run, null, 2));
      ran++;
    } catch (e) {
      errors.push(`${id}: ${String((e as Error).message ?? e)}`);
      rows.push(`| ${id} | ERROR | | | | | | | |`);
      continue;
    }
    const truth = (loadCase(id).ground_truth ?? {}) as Truth;
    const isLabelled = Boolean(truth.labeled_by && truth.labeled_by.trim());
    const f = run.merged.findings;
    const agreed = f.filter((x) => x.agreement === "2_of_2").length;
    const called = f.filter((x) => x.status !== "stable");
    const failedChecks = run.code_checks.filter((c) => !c.pass).length;
    if (!isLabelled) {
      rows.push(`| ${id} | UNLABELLED | | | | | | ${agreed} of ${f.length} | ${failedChecks} | |`);
      continue;
    }
    labelled++;
    const truthFindings = (truth.findings ?? []).filter((t) => t.region);
    const caught = truthFindings.filter((t) => f.some((x) => x.region === t.region)).length;
    const falseFlags = called.filter((x) => !truthFindings.some((t) => t.region === x.region)).length;
    const refuse = truth.should_refuse ?? [];
    // A refusal counts as correct when a Can't determine item is linked to a finding in the named region,
    // or names the region in its question.
    const refused = (r: string) => run.merged.cant_determine.some((c) =>
      c.question.toLowerCase().includes(r.toLowerCase()) || f.some((x) => x.id === c.related_finding && x.region === r));
    const correctRefusals = refuse.filter(refused).length;
    rows.push(
      `| ${id} | labelled by ${cell(truth.labeled_by!)} | ${truthFindings.length} | ${caught} | ${falseFlags} | ${correctRefusals} | ${refuse.length - correctRefusals} | ${agreed} of ${f.length} | ${failedChecks} | |`
    );
  }
  const md = [
    "# Scorecard", "",
    `Generated ${new Date().toISOString()}. Cases labelled by a clinician: ${labelled}. Cases run: ${ran}.`,
    "A smoke test, not a validation study. Matching is by region only. Unlabelled cases have no score.", "",
    "| Case | Ground truth | Findings in truth | Caught | False flags | Correct refusals | Missed refusals | Reads agreed | Code checks failed | Would sign with minor edits |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows, "",
    ...(errors.length ? ["## Pipeline errors", "", ...errors.map((e) => `- ${e}`), ""] : []),
  ].join("\n");
  fs.writeFileSync("scorecard.md", md);
  console.log(md);
  if (errors.length) process.exit(1);
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
