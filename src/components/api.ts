// Every server call the read screen makes goes through this file.
// STUBS: nothing is sent or saved yet. Each returns { ok: true, stub: true } so the screen can
// say "not saved". The main session replaces the bodies with fetch() calls to its routes and
// drops the stub flag; the screen needs no other change.
import type { MeasurementEntry, Review } from "./types";

export type ApiResult<T = object> = ({ ok: true; stub?: boolean } & T) | { ok: false; error: string };

export async function reviewFinding(
  caseId: string,
  findingId: string,
  review: Review | null // null clears the review (undo)
): Promise<ApiResult<{ state?: string }>> {
  void caseId; void findingId; void review;
  return { ok: true, stub: true };
}

// The server runs src/lib/recist.ts on the typed values and may return the new RECIST line.
export async function saveMeasurement(
  caseId: string,
  entry: MeasurementEntry
): Promise<ApiResult<{ recist?: { category: string; line: string } }>> {
  void caseId; void entry;
  return { ok: true, stub: true };
}

export async function saveReportDraft(caseId: string, text: string): Promise<ApiResult> {
  void caseId; void text;
  return { ok: true, stub: true };
}

export async function sign(
  caseId: string,
  role: "resident" | "attending"
): Promise<ApiResult<{ state?: string; at?: string }>> {
  void caseId; void role;
  return { ok: true, stub: true, at: new Date().toISOString() };
}
