// Every server call the screens make goes through this file.
import type { CasePayload, MeasurementEntry, Review } from "./types";

export type ApiResult<T = object> = ({ ok: true; stub?: boolean; payload?: CasePayload } & T) | { ok: false; error: string };

async function post(caseId: string, action: string, body: object = {}): Promise<ApiResult<{ payload?: CasePayload }>> {
  try {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/${action}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; payload?: CasePayload };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    return { ok: true, payload: json.payload };
  } catch (e) {
    return { ok: false, error: `Could not reach the server: ${String((e as Error).message ?? e)}` };
  }
}

export const runCase = (caseId: string) => post(caseId, "run");

export async function reviewFinding(
  caseId: string, findingId: string, review: Review | null // null clears the review (undo)
): Promise<ApiResult<{ state?: string }>> {
  const r = await post(caseId, "review", { finding_id: findingId, review });
  return r.ok ? { ...r, state: r.payload?.state } : r;
}

// The server runs src/lib/recist.ts on the typed values and returns the new RECIST line.
export async function saveMeasurement(
  caseId: string, entry: MeasurementEntry
): Promise<ApiResult<{ state?: string; recist?: { category: string; line: string } }>> {
  const r = await post(caseId, "measure", entry);
  return r.ok ? { ...r, state: r.payload?.state, recist: r.payload?.recist ?? undefined } : r;
}

export async function saveReportDraft(caseId: string, text: string): Promise<ApiResult<{ state?: string }>> {
  const r = await post(caseId, "report", { text });
  return r.ok ? { ...r, state: r.payload?.state } : r;
}

export async function sign(caseId: string, role: "resident" | "attending"): Promise<ApiResult<{ state?: string; at?: string }>> {
  const r = await post(caseId, "sign", { role });
  return r.ok ? { ...r, state: r.payload?.state, at: r.payload?.signature?.[role]?.at } : r;
}

export const openResult = (caseId: string) => post(caseId, "open");
export const signOrder = (caseId: string) => post(caseId, "order");
export const markInformed = (caseId: string) => post(caseId, "informed");
