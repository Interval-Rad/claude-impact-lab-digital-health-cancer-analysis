"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, hhmmss, Syn, TIER_GLYPH, SUBGROUP, usePoll } from "@/components/common";

type Row = {
  case_id: string; patient: string; mrn: string; exam: string; indication: string | null; arrived: string; state: string; progress: string;
  tier: string | null; subgroup: string | null; lowAgreement: boolean; reason: string; context_flags: { item: string; bears_on: string; why: string }[];
  paged_at: string | null; not_acknowledged: boolean; noDraft: boolean; safety_net: string[];
};

export default function Worklist() {
  const { data, error, reload } = usePoll<{ rows: Row[] }>("/api/cases", 1500);
  const router = useRouter();
  const run = async (id: string) => { await api("/api/cases", { case_id: id }); reload(); router.push(`/case/${id}`); };
  return (
    <main>
      <div className="banner"><span className="label">Worklist</span><span className="muted">Plain sort on the visible columns: tier, then severity subgroup, then low agreement first, then oldest first. No blended score.</span></div>
      {error && <div className="pane crit-txt mono">Could not load: {error}</div>}
      <table className="dense">
        <thead><tr><th>Tier</th><th>Severity subgroup</th><th>Agreement</th><th>Patient</th><th>Exam</th><th>Indication</th><th>Context flags</th><th>State</th><th>Arrived</th><th>Support</th></tr></thead>
        <tbody>
          {(data?.rows ?? []).map((r) => (
            <tr key={r.case_id} className={`row ${r.tier === "critical" ? "crit" : ""}`} onClick={() => r.state !== "NOT_SUBMITTED" && router.push(`/case/${r.case_id}`)}>
              <td className="mono">{r.tier ? TIER_GLYPH[r.tier] : "—"}{r.paged_at && <div className="flag">on-call paged {hhmmss(r.paged_at)}</div>}{r.not_acknowledged && <div className="crit-txt">not acknowledged</div>}</td>
              <td className="mono">{r.noDraft ? "no AI draft" : r.subgroup ? SUBGROUP[r.subgroup] : "—"}<div className="muted" style={{ fontFamily: "var(--font-sans)" }}>{r.reason}</div></td>
              <td className="mono">{r.state === "NOT_SUBMITTED" || !r.subgroup ? "—" : r.lowAgreement ? <span className="flag">! low</span> : "reads agree"}</td>
              <td>{r.patient}<Syn /><div className="mono muted">{r.mrn}</div></td>
              <td className="mono">{r.exam}</td>
              <td>{r.indication ? <>{r.indication}<Syn /></> : <span className="muted mono">hidden until focused pass</span>}</td>
              <td>{r.context_flags.length ? r.context_flags.map((f, i) => <div key={i} className="mono">{f.item} → {f.bears_on}</div>) : <span className="muted">—</span>}</td>
              <td className="mono">{r.state === "NOT_SUBMITTED" ? <button className="btn primary" onClick={(e) => { e.stopPropagation(); run(r.case_id); }}>Run pipeline</button> : <>{r.state}<div className="muted">{r.progress}</div></>}</td>
              <td className="mono muted">{r.arrived.startsWith("9999") ? "—" : hhmmss(r.arrived)}</td>
              <td className="mono muted">{r.safety_net.length ? r.safety_net.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.rows.length === 0 && <div className="pane muted">No cases found. Run <span className="mono">npm run seed</span>.</div>}
      <div className="pane muted mono">Support flags never enter the sort. <Link href="/registry">Registry →</Link></div>
    </main>
  );
}
