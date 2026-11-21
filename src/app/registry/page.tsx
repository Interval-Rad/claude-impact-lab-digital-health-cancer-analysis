"use client";
import { Syn, usePoll } from "@/components/common";

type Reg = { synthetic: { group: string; due: number; booked: number; completed: number }[]; live: { case_id: string; patient: string; reason: string[]; follow_up: { study: string; due_by: string }; owner: string; state: string; low_cost_options_needed: boolean }[] };

export default function Registry() {
  const { data } = usePoll<Reg>("/api/registry", 3000);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return (
    <main className="pane" style={{ maxWidth: 1000 }}>
      <h2 className="label">Follow-up registry <Syn /></h2>
      <p className="muted">Counts below are synthetic. The metric a health system acts on is the gap between groups.</p>
      <table className="dense"><thead><tr><th>Group</th><th>Follow-ups due</th><th>Booked</th><th>Completed</th><th>Completion</th></tr></thead>
        <tbody>{data?.synthetic.map((r) => <tr key={r.group}><td>{r.group}</td><td className="mono">{r.due}</td><td className="mono">{r.booked}</td><td className="mono">{r.completed}</td><td className="mono"><b>{pct(r.completed, r.due)}</b></td></tr>)}</tbody></table>
      <h2 className="label" style={{ marginTop: 24 }}>Navigator queue (from signed cases in this demo)</h2>
      {data?.live.length === 0 && <p className="muted mono">No navigator referrals yet. Sign the ED refusal case (D_*) to create one.</p>}
      <table className="dense"><tbody>{data?.live.map((r) => (
        <tr key={r.case_id}><td>{r.patient}<Syn /></td><td className="mono">{r.reason.join(", ")}</td><td className="mono">{r.follow_up.study} by {r.follow_up.due_by}</td><td className="mono">{r.owner}</td><td className="mono">{r.low_cost_options_needed ? "low-cost options needed" : ""}</td></tr>
      ))}</tbody></table>
      <p className="muted mono">These fields add support. They never enter the worklist sort and never change reading order.</p>
    </main>
  );
}
