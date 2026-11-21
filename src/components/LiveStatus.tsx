"use client";
// The plain-text status line for a case: what is running, what failed, where the answers came from.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "./api";
import { clockTime } from "./format";
import type { CasePayload } from "./types";

const RUNNING = ["BLIND_READING", "RECONCILED", "FOCUSED", "TRIAGED"];

export default function LiveStatus({ payload }: { payload: CasePayload }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = RUNNING.includes(payload.state) || Boolean(payload.busy) || starting;
  const awaitingOpen = Boolean(payload.delivery && !payload.delivery.opened_at && payload.delivery.deadline_at);

  // Poll while a background step runs, and while a delivered result is waiting to be opened.
  useEffect(() => {
    if (!working && !awaitingOpen) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [working, awaitingOpen, router]);

  useEffect(() => { if (RUNNING.includes(payload.state)) setStarting(false); }, [payload.state]);

  if (payload._mock) return null;

  async function run() {
    setStarting(true);
    setError(null);
    const r = await api.runCase(payload.case_id);
    if (!r.ok) { setError(r.error); setStarting(false); }
    router.refresh();
  }

  const canRun = !working && payload.lightbox === null && !payload.signature?.attending;
  const calls = payload.calls ?? [];
  const replayed = calls.filter((c) => c.replayed);
  const models = [...new Set(calls.map((c) => c.model))];
  const failedChecks = (payload.code_checks ?? []).filter((c) => !c.pass);
  const delivered = Boolean(payload.delivery);

  return (
    <div className="strip shrink-0 flex-wrap" role="status" aria-live="polite">
      <span className="label">status</span>
      <span className="data">
        {starting && !RUNNING.includes(payload.state) ? "Starting" : payload.busy ?? payload.status_text ?? "Not run yet. No AI draft."}
        {working ? " …" : ""}
      </span>
      {payload.state === "NEEDS_HUMAN" && (
        <span className="data attn">NEEDS HUMAN ! No AI draft. A person reads this study.</span>
      )}
      {(payload.error || error) && (
        <span className="data attn" role="alert">
          {error ?? payload.error} !
        </span>
      )}
      {failedChecks.map((c) => (
        <span key={c.check} className="data attn">
          code check failed: {c.check} !
        </span>
      ))}
      {payload.paged_on_call_at && <span className="data attn">on-call paged {clockTime(payload.paged_on_call_at)} !</span>}
      {canRun && (
        <button type="button" className="btn" onClick={run}>
          {payload.state === "NEEDS_HUMAN" ? "Run AI first read again" : "Run AI first read"}
        </button>
      )}
      {delivered && (
        <Link href={`/case/${payload.case_id}/handoff`} className="data underline underline-offset-2">
          Handoff
        </Link>
      )}
      <span className="data ml-auto text-muted">
        {payload.replay && <span className="tag mr-2">replay mode</span>}
        {replayed.length > 0 && (
          <span className="mr-2">
            replayed, recorded {clockTime(replayed[replayed.length - 1].recorded_at)} ({replayed.length} of {calls.length} calls)
          </span>
        )}
        {models.length > 0 && <span>models: {models.join(", ")}</span>}
      </span>
    </div>
  );
}
