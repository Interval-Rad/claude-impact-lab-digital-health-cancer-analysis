// Every server call the screens make goes through this file.
import type { CasePayload, MeasurementEntry, Review } from "./types";

export type ApiResult<T = object> = ({ ok: true; stub?: boolean; payload?: CasePayload } & T) | { ok: false; error: string };

async function post(caseId: string, action: string, body: object = {}): Promise<ApiResult<{ payload?: CasePayload }>> {
  const send = () =>
    fetch(`/api/cases/${encodeURIComponent(caseId)}/${action}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
  try {
    let res = await send();
    // A 5xx with no JSON body is the server itself failing (for example mid-recompile in dev),
    // not a refusal from the app. Try once more before reporting it.
    if (res.status >= 500 && !(res.headers.get("content-type") ?? "").includes("application/json")) res = await send();
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; payload?: CasePayload } | null;
    if (!json) return { ok: false, error: `The server returned an unreadable answer (${res.status}). Nothing was saved. Try again.` };
    if (!res.ok || !json.ok) return { ok: false, error: json.error ?? `Request failed (${res.status})` };
    return { ok: true, payload: json.payload };
  } catch (e) {
    return { ok: false, error: `Could not reach the server: ${String((e as Error).message ?? e)}` };
  }
}

export const runCase = (caseId: string) => post(caseId, "run");
export const resetCase = (caseId: string) => post(caseId, "reset");

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
