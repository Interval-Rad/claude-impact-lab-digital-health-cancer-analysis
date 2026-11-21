"use client";
import { useEffect, useState } from "react";
import type { CaseState } from "@/lib/types";
import { api, Copy, Syn, usePoll, VoiceButton } from "@/components/common";
import { DEMO_FACTOR } from "@/components/Header";

type Row = { case_id: string; patient: string; mrn: string; state: string };
type View = { head: { display_name: string; mrn: string }; state: (CaseState) | null };
const DELIVERED = ["DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"];

export default function Inbox() {
  const { data: list } = usePoll<{ rows: Row[] }>("/api/cases", 1500);
  const rows = (list?.rows ?? []).filter((r) => DELIVERED.includes(r.state));
  const [sel, setSel] = useState<string | null>(null);
  const id = sel ?? rows[0]?.case_id ?? null;
  const { data, reload } = usePoll<View>(id ? `/api/cases/${id}` : "/api/registry", 1200);
  const [err, setErr] = useState<string | null>(null);
  const [, tickN] = useState(0);
  useEffect(() => { const i = setInterval(() => tickN((n) => n + 1), 500); return () => clearInterval(i); }, []);
  const act = async (fn: () => Promise<unknown>) => { try { setErr(null); await fn(); await reload(); } catch (e) { setErr((e as Error).message); } };

  const s = id ? (data as View | null)?.state : null; const d = s?.delivery;
  const countdown = (st: CaseState | null | undefined) => {
    if (!st?.delivery?.due_at || st.state !== "DELIVERED") return null;
    const ms = Date.parse(st.delivery.due_at) - Date.now();
    return ms > 0 ? `${Math.ceil((ms / 1000) * DEMO_FACTOR / 60)} min to re-send and escalate` : "re-sent and escalated";
  };

  return (
    <main className="prov" style={{ minHeight: "calc(100vh - 50px)" }}>
      <div className="list rule-b" style={{ borderRight: "1px solid var(--rule)" }}>
        <div className="pane label">Results</div>
        {rows.length === 0 && <div className="pane muted">Nothing delivered yet. A result appears here after the attending signs.</div>}
        {rows.map((r) => (
          <div key={r.case_id} className={r.case_id === id ? "sel" : ""} onClick={() => setSel(r.case_id)}>
            <b>{r.patient}</b><Syn /><div className="mono muted">{r.mrn} · {r.state === "DELIVERED" ? "unopened" : r.state.toLowerCase().replace("_", " ")}</div>
            {r.case_id === id && s?.delivery && <div className="mono flag">{countdown(s)}</div>}
          </div>
        ))}
      </div>
      <div className="pane" style={{ maxWidth: 760 }}>
        {err && <p className="crit-txt mono">{err}</p>}
        {!s || !d ? <p className="muted">Select a result.</p> : <>
          <h2 style={{ margin: "0 0 4px", fontSize: "1.3rem" }}>{d.provider_message.subject}</h2>
          <div className="mono muted">{(data as View).head.display_name} <Syn /> · tier {d.tier} · sent {new Date(d.sent_at).toLocaleTimeString()}</div>
          {s.state === "DELIVERED" && <p><button className="btn primary" onClick={() => act(() => api(`/api/cases/${id}/open`, {}))}>Open result (stops the timer)</button> <span className="mono flag">{countdown(s)}</span></p>}
          {d.actions.filter((a) => a.action !== "send").length > 0 && <div className="mono flag">{d.actions.filter((a) => a.action !== "send").map((a) => a.detail).join(" ")}</div>}
          <h3 className="label" style={{ marginTop: 16 }}>What changed, what the radiologist recommends, what waits for you</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{d.provider_message.body}</p>
          <h3 className="label">Pre-filled follow-up order <span className="muted">(draft. You sign it.)</span></h3>
          {d.followup_order ? <>
            <table className="dense"><tbody>{Object.entries(d.followup_order).map(([k, v]) => <tr key={k}><td className="mono muted">{k}</td><td>{v}</td></tr>)}</tbody></table>
            <p><button className="btn primary" disabled={s.state === "DELIVERED" || !!s.order_signed_at} onClick={() => act(() => api(`/api/cases/${id}/order`, {}))}>{s.order_signed_at ? "Order signed" : "Sign order"}</button>{s.state === "DELIVERED" && <span className="mono muted"> open the result first</span>}</p>
          </> : <p className="muted">The report recommends no follow-up study.</p>}
          <details style={{ margin: "12px 0" }}><summary className="label" style={{ cursor: "pointer" }}>Full signed report</summary><pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{s.signed_report}</pre></details>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={s.state !== "ACKNOWLEDGED"} onClick={() => act(() => api(`/api/cases/${id}/informed`, {}))}>{s.state === "PATIENT_INFORMED" ? "Patient informed ✓" : "Mark patient informed"}</button>
            <Copy text={d.epic_chat_draft} label="Copy Epic chat question" />
          </p>
          <p className="mono muted">The patient hears results from you first. Voice unlocks after you mark the patient informed.</p>
          <p><VoiceButton id={id!} kind="scheduling_call" label="Play scheduling call" unlocked={s.state === "PATIENT_INFORMED"} /></p>
        </>}
      </div>
    </main>
  );
}
