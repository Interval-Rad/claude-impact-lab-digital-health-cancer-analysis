// npm run lightbox -- <case_id>
// Runs the three Lightbox calls on one case and prints the merged JSON.
import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "./env";
import { caseDir } from "../src/lib/cases";
import { runLightbox } from "../src/lib/lightbox";
import { assertModelsAvailable } from "../src/lib/model";

loadEnv();
const caseId = process.argv[2] ?? "new_nodule";

async function main() {
  await assertModelsAvailable();
  const run = await runLightbox(caseId, (s) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${s}`));
  fs.writeFileSync(path.join(caseDir(caseId), "lightbox.json"), JSON.stringify(run, null, 2));
  console.log(JSON.stringify(run.merged, null, 2));
  console.error("\nCode checks:");
  for (const c of run.code_checks) console.error(`  ${c.pass ? "pass" : "FAIL"}  ${c.check}${c.detail ? `: ${c.detail}` : ""}`);
  for (const m of run.calls) console.error(`  ${m.label}: ${m.model}${m.replayed ? ` (replayed, recorded ${m.recorded_at})` : ""}, attempts ${m.attempts}`);
  if (run.focused_skipped_reason) console.error(`\n${run.focused_skipped_reason}`);
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
