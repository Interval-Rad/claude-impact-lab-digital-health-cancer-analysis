// npm run baseline
// Saves each unsigned, unreviewed AI draft as that case's baseline (data/cases/<id>/baseline.json).
// "Reset demo" in the app returns a case to its baseline.
import { listCaseIds } from "../src/lib/cases";
import { saveBaseline } from "../src/lib/charge";

for (const id of listCaseIds()) console.log(`${id}: ${saveBaseline(id) ? "baseline saved" : "skipped (not an unreviewed draft)"}`);
