import fs from "fs";
import path from "path";
import type { CaseFile, CaseState } from "./types";

const ROOT = path.join(process.cwd(), "data");
const CASES = path.join(ROOT, "cases");
const AUDIT = path.join(ROOT, "audit.jsonl");

export function validId(id: string) { return /^[A-Za-z0-9_-]{1,80}$/.test(id); }
export function caseDir(id: string) {
  if (!validId(id)) throw new Error("bad case id");
  return path.join(CASES, id);
}
export function listCaseIds(): string[] {
  if (!fs.existsSync(CASES)) return [];
  return fs.readdirSync(CASES).filter((d) => validId(d) && fs.existsSync(path.join(CASES, d, "case.json")));
}
export function readCaseFile(id: string): CaseFile { return JSON.parse(fs.readFileSync(path.join(caseDir(id), "case.json"), "utf8")); }
export function readState(id: string): CaseState | null {
  const f = path.join(caseDir(id), "state.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
export function writeState(s: CaseState) {
  const f = path.join(caseDir(s.case_id), "state.json");
  fs.writeFileSync(f + ".tmp", JSON.stringify(s, null, 2));
  fs.renameSync(f + ".tmp", f);
}
export function readImage(id: string, which: "prior" | "current"): Buffer { return fs.readFileSync(path.join(caseDir(id), `${which}.png`)); }

export type AuditEvent = {
  case_id: string; ts: string;
  actor: "lightbox" | "stat" | "courier" | "resident" | "attending" | "provider" | "charge";
  event: "state_change" | "indication_released" | "accept" | "edit" | "reject" | "measure" | "sign" | "send" | "open" | "page" | "call" | "escalate" | "qc_fail" | "order" | "informed" | "voice";
  finding_id: string | null; before: unknown; after: unknown; reason: string | null;
};
export function audit(e: Omit<AuditEvent, "ts" | "finding_id" | "before" | "after" | "reason"> & Partial<AuditEvent>) {
  fs.mkdirSync(ROOT, { recursive: true });
  const rec: AuditEvent = { finding_id: null, before: null, after: null, reason: null, ts: new Date().toISOString(), ...e };
  fs.appendFileSync(AUDIT, JSON.stringify(rec) + "\n");
}
export function readAudit(caseId?: string): AuditEvent[] {
  if (!fs.existsSync(AUDIT)) return [];
  const all = fs.readFileSync(AUDIT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditEvent);
  return caseId ? all.filter((a) => a.case_id === caseId) : all;
}
