// Case files on disk: data/cases/<case_id>/{case.json, prior.*, current.*}
import fs from "node:fs";
import path from "node:path";
import { CaseFile } from "./schemas";

export const CASES_DIR = path.join(process.cwd(), "data", "cases");

export function assertCaseId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid case id");
  return id;
}

export function caseDir(id: string): string {
  return path.join(CASES_DIR, assertCaseId(id));
}

export function listCaseIds(): string[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs.readdirSync(CASES_DIR).filter((d) => fs.existsSync(path.join(CASES_DIR, d, "case.json"))).sort();
}

export function loadCase(id: string): CaseFile {
  const file = path.join(caseDir(id), "case.json");
  if (!fs.existsSync(file)) throw new Error(`Case not found: ${id}`);
  const parsed = CaseFile.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${id}/case.json does not match the case schema: ${parsed.error.message}`);
  return parsed.data;
}

export function loadImage(id: string, which: "prior" | "current"): Buffer {
  const c = loadCase(id);
  const name = path.basename(c[which].file); // no path traversal out of the case folder
  const file = path.join(caseDir(id), name);
  if (!fs.existsSync(file)) {
    throw new Error(`${id}: image ${name} is missing. Images are not in git. Run: python dataset/pull_demo_pairs.py --out data/cases`);
  }
  return fs.readFileSync(file);
}

export function toViewLabel(view: string): "PA" | "AP" | "unknown" {
  return view === "PA" || view === "AP" ? view : "unknown";
}
