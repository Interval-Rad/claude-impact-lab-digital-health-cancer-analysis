// npm run pipeline -- <case_id>
// Runs one case from RECEIVED to DRAFTED (or NEEDS_HUMAN) without the browser and prints a summary.
import { loadEnv } from "./env";
import { loadState, RUNNING_STATES, startPipeline } from "../src/lib/charge";
import { assertModelsAvailable } from "../src/lib/model";

loadEnv();
const caseId = process.argv[2] ?? "new_nodule";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await assertModelsAvailable();
  startPipeline(caseId);
  let last = "";
  for (;;) {
    await sleep(1000);
    const s = loadState(caseId)!;
    if (s.status_text !== last) { last = s.status_text; console.error(`[${new Date().toISOString().slice(11, 19)}] ${s.state}: ${s.status_text}`); }
    if (s.state !== "RECEIVED" && !RUNNING_STATES.includes(s.state)) break;
  }
  const s = loadState(caseId)!;
  console.log(`\nstate: ${s.state}${s.error ? `\nerror: ${s.error}` : ""}`);
  console.log(`indication released: ${s.indication_released_at}`);
  if (s.lightbox) {
    console.log(`comparable: ${s.lightbox.comparability.comparable} (reads: ${s.lightbox.comparable_by_read.a} / ${s.lightbox.comparable_by_read.b})`);
    for (const f of s.lightbox.findings) console.log(`  ${f.id} ${f.region} ${f.kind} ${f.status} ${f.agreement ?? "focused pass"}${f.outside_indication ? " outside-indication" : ""}`);
    console.log(`can't determine: ${s.lightbox.cant_determine.length}`);
    for (const c of s.lightbox.cant_determine) console.log(`  - ${c.question} | Next: ${c.recommend}`);
    console.log(`look first: ${s.lightbox.look_first.join(", ") || "none"}`);
    if (s.lightbox.indication_pass) console.log(`indication pass: ${s.lightbox.indication_pass.answer}`);
    for (const d of s.lightbox.prior_report_discrepancies) console.log(`  prior report says: ${d.prior_report_says} | images show: ${d.images_show}`);
  }
  for (const c of s.code_checks.filter((x) => !x.pass)) console.log(`code check FAILED: ${c.check}: ${c.detail}`);
  if (s.stat) console.log(`triage: ${s.stat.urgency_tier} / ${s.stat.severity_subgroup} / ${s.stat.worklist_reason}`);
  if (s.qc) console.log(`QC: ${s.qc.pass ? "pass" : "fail"} ${JSON.stringify(s.qc.mismatches)}`);
  if (s.report_draft) console.log(`\n${s.report_draft}`);
  console.log(`\ncalls: ${s.calls.map((m) => `${m.label}(${m.attempts})`).join(", ")}`);
}

main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
