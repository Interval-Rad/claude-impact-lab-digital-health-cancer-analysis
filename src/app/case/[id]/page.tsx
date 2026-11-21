"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CaseState } from "@/lib/types";
import Viewer, { V0, type VState } from "@/components/Viewer";
import { AGREE, api, hhmmss, STATUS_SHAPE, Syn, usePoll } from "@/components/common";
import { toggleTheme, useRole } from "@/components/Header";

type Head = { case_id: string; display_name: string; mrn: string; prior_date: string; current_date: string; ordering_provider: { name: string; role: string };
  prior_view: string; current_view: string; indication: string | null; prior_report: string | null; safety_net: { triggers: string[] } };
type View = { head: Head; state: (CaseState & { banner: string; fixture_notice: string | null; all_reviewed: boolean }) | null };

export default function ReadScreen() {
  const { id } = useParams<{ id: string }>();
  const role = useRole();
  const { data, reload } = usePoll<View>(`/api/cases/${id}`, 1200);
  const [v, setV] = useState<VState>(V0);
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<{ fid: string; mode: "edit" | "reject" } | null>(null);
  const [reason, setReason] = useState(""); const [edited, setEdited] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [meas, setMeas] = useState<Record<string, { p: string; c: string }>>({});
  const [reportText, setReportText] = useState<string | null>(null);
  const measRef = useRef<HTMLDivElement>(null); const reasonRef = useRef<HTMLInputElement>(null);

  const s = data?.state ?? null, head = data?.head;
  const findings = useMemo(() => s?.lightbox?.findings ?? [], [s?.lightbox]);
  const cur = findings[sel];
  const act = useCallback(async (fn: () => Promise<unknown>) => { try { setErr(null); await fn(); await reload(); } catch (e) { setErr((e as Error).message); } }, [reload]);

  const review = (fid: string, action: "accept" | "edit" | "reject", rsn?: string, ed?: string) =>
    act(async () => { await api(`/api/cases/${id}/review`, { finding_id: fid, action, reason: rsn, edited_description: ed }); setForm(null); setReason(""); setEdited(""); });
  const signRes = () => act(() => api(`/api/cases/${id}/sign`, { role: "resident", name: "Resident (demo)" }));
  const signAtt = () => act(() => api(`/api/cases/${id}/sign`, { role: "attending", name: "Attending (demo)" }));
  const saveMeas = () => act(() => api(`/api/cases/${id}/measure`, { measurements: Object.entries(meas).filter(([, m]) => m.p !== "" && m.c !== "").map(([finding_id, m]) => ({ finding_id, prior_mm: Number(m.p), current_mm: Number(m.c) })) }));

  // Keyboard: J/K A E R Space I M Cmd+Enter. D is handled in the header.
  const canResident = s?.state === "DRAFTED" && s.all_reviewed && !s.drafting;
  const canAttending = s?.state === "RESIDENT_REVIEWED" && !s.drafting;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (canResident) signRes(); else if (canAttending) signAtt(); return; }
      if (t?.matches?.("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j") setSel((i) => Math.min(findings.length - 1, i + 1));
      else if (key === "k") setSel((i) => Math.max(0, i - 1));
      else if (key === "a" && cur && role === "radiology") review(cur.id, "accept");
      else if ((key === "e" || key === "r") && cur) { setForm({ fid: cur.id, mode: key === "e" ? "edit" : "reject" }); setEdited(cur.description); setTimeout(() => reasonRef.current?.focus(), 30); e.preventDefault(); }
      else if (key === " ") { e.preventDefault(); setV((p) => ({ ...p, flicker: true, which: p.flicker && p.which === "current" ? "prior" : "current" })); }
      else if (key === "i") setV((p) => ({ ...p, invert: !p.invert }));
      else if (key === "m") { measRef.current?.scrollIntoView({ block: "center" }); measRef.current?.querySelector("input")?.focus(); e.preventDefault(); }
      else if (key === "escape") { setForm(null); setV((p) => ({ ...p, flicker: false })); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  void toggleTheme;

  if (!data || !head) return <main className="pane muted mono">Loading</main>;
  if (!s) return (
    <main className="pane"><h2 className="label">Not submitted</h2>
      <p>{head.display_name}<Syn /> has not been run.</p>
      <button className="btn primary" onClick={() => act(() => api("/api/cases", { case_id: id }))}>Run pipeline</button>
      {err && <p className="crit-txt mono">{err}</p>}</main>
  );

  const hl = cur ? `${cur.id} · ${cur.region.replace(/_/g, " ")} · ${cur.kind.replace(/_/g, " ")} (region label only)` : null;
  const processing = !["DRAFTED", "RESIDENT_REVIEWED", "ATTENDING_SIGNED", "DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED", "NEEDS_HUMAN"].includes(s.state);
  const lb = s.lightbox; const reviewedN = findings.filter((f) => s.reviews[f.id]).length;
  const locked = ["ATTENDING_SIGNED", "DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"].includes(s.state);
  const ro = (id: string) => s.reviews[id];

  return (
    <main style={{ paddingBottom: 70 }}>
      {s.fixture_notice && <div className="banner fixture"><b>FIXTURE MODE</b><span>Scripted output for demo. Not a read of these images. Set ANTHROPIC_API_KEY on the server for live reads.</span></div>}
      <div className="banner rule-b">
        <b className={s.signature ? "" : "flag"}>{s.banner}</b>
        <span className="muted">state: <b className="mono" style={{ color: "var(--text)" }}>{s.state}</b> · v{s.version}</span>
        <span className="muted">{s.drafting ? "Report redraft running" : processing ? s.progress : ""}</span>
        <span style={{ flex: 1 }} />
        {s.signature && <Link href={`/case/${id}/handoff`} className="btn primary" style={{ textDecoration: "none" }}>Handoff →</Link>}
      </div>
      {s.state === "NEEDS_HUMAN" && <div className="pane cant"><b>NEEDS HUMAN. No AI draft.</b> {s.needs_human_reason} A radiologist reads this study from scratch.</div>}
      {err && <div className="pane crit-txt mono">{err}</div>}

      <div className="read-grid">
        <Viewer id={id} v={v} set={setV} highlight={hl}
          priorLabel={`${head.prior_view} ${head.prior_date} syn`} currentLabel={`${head.current_view} ${head.current_date} syn`} />
        <div className="rail">
          <section>
            <div className="label">Comparability</div>
            {lb ? <>
              <div className="mono"><b>{lb.comparability.comparable}</b>{lb.study_flags.includes("reads_disagree_on_comparability") && <span className="flag"> · reads disagree on comparability</span>}</div>
              {lb.comparability.differences.map((d, i) => <div key={i} className="mono muted">{d.factor}: {d.detail}<br />prevents: {d.prevents}</div>)}
              <div className="muted" style={{ marginTop: 4 }}>{lb.limits}</div>
            </> : <div className="muted mono">{processing ? s.progress : "—"}</div>}
          </section>

          {lb && <section>
            <div className="label">Look first</div>
            {lb.look_first.length ? lb.look_first.map((fid) => { const f = findings.find((x) => x.id === fid); return f && <div key={fid} className="mono">{fid} · {f.region.replace(/_/g, " ")} · {f.kind.replace(/_/g, " ")}</div>; }) : <span className="muted mono">none flagged</span>}
          </section>}

          <section>
            <div className="label" style={{ display: "flex", justifyContent: "space-between" }}><span>Findings</span><span>reads agree · <span className="blind-mark">blind</span></span></div>
            {findings.length === 0 && lb && <div className="muted mono">No findings from either read.</div>}
            {findings.map((f, i) => {
              const r = ro(f.id); const cls = r ? (r.action === "accept" ? "accepted" : r.action === "reject" ? "rejected" : "edited") : "";
              return (
                <div key={f.id} className={`finding ${cls} ${i === sel ? "sel" : ""}`}>
                  <div className="top" onClick={() => { setSel(i); setOpen((o) => ({ ...o, [f.id]: !o[f.id] })); }}>
                    <b className="mono">{f.id}</b><span className="mono">{f.region.replace(/_/g, " ")}</span><span>{f.kind.replace(/_/g, " ")}</span>
                    <span className="mono">{STATUS_SHAPE[f.status]}</span>
                    <span className={`mono ${f.agreement === "2_of_2" ? "" : "flag"}`}>{AGREE[f.agreement]}</span>
                    {f.time_sensitive && <span className="crit-txt mono">■ time-sensitive</span>}
                    {f.outside_indication && <span className="muted mono">outside indication</span>}
                    {f.added_in_focused_pass && <span className="muted mono">added in focused pass</span>}
                    {r && <span className="mono muted">[{r.action}{r.reason ? `: ${r.reason}` : ""}]</span>}
                  </div>
                  {open[f.id] && <div style={{ marginTop: 4 }}>
                    <div>{r?.edited_description ?? f.description}</div>
                    <div className="muted">{f.evidence}</div>
                    <div className="mono muted">read A: <span className="blind-mark">{f.read_a_status ?? "not seen"}</span> · read B: <span className="blind-mark">{f.read_b_status ?? "not seen"}</span> · size change: {f.size_change_words.replace(/_/g, " ")}</div>
                  </div>}
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <button className="btn" disabled={s.state === "NEEDS_HUMAN"} onClick={() => { setSel(i); review(f.id, "accept"); }}>Accept <kbd>A</kbd></button>
                    <button className="btn" onClick={() => { setSel(i); setForm({ fid: f.id, mode: "edit" }); setEdited(f.description); setTimeout(() => reasonRef.current?.focus(), 30); }}>Edit <kbd>E</kbd></button>
                    <button className="btn" onClick={() => { setSel(i); setForm({ fid: f.id, mode: "reject" }); setTimeout(() => reasonRef.current?.focus(), 30); }}>Reject <kbd>R</kbd></button>
                  </div>
                  {form?.fid === f.id && (
                    <form style={{ marginTop: 6, display: "grid", gap: 4 }} onSubmit={(e) => { e.preventDefault(); review(f.id, form.mode, reason, form.mode === "edit" ? edited : undefined); }}>
                      {form.mode === "edit" && <input className="field" value={edited} onChange={(e) => setEdited(e.target.value)} aria-label="Edited description" />}
                      <input ref={reasonRef} className="field" placeholder={`Reason for ${form.mode} (required)`} value={reason} onChange={(e) => setReason(e.target.value)} />
                      <div style={{ display: "flex", gap: 6 }}><button className="btn primary" type="submit" disabled={!reason.trim()}>Save {form.mode}</button><button className="btn" type="button" onClick={() => setForm(null)}>Cancel</button></div>
                    </form>
                  )}
                </div>
              );
            })}
          </section>

          {lb && <section>
            <div className="label">Can&apos;t determine</div>
            {lb.cant_determine.length === 0 && <span className="muted mono">none</span>}
            {lb.cant_determine.map((c, i) => (
              <div key={i} className="cant"><div><b>{c.question}</b></div><div>Reason: {c.reason}</div><div>Next: {c.recommend}{c.related_finding && <span className="mono muted"> ({c.related_finding})</span>}</div></div>
            ))}
          </section>}

          {lb && <section ref={measRef}>
            <div className="label">Measurements (you enter)</div>
            {lb.comparability.comparable !== "yes" && <div className="flag mono" style={{ marginBottom: 4 }}>Comparability is {lb.comparability.comparable}. Measurements across different projections are not comparable.</div>}
            {findings.filter((f) => f.needs_measurement && ro(f.id)?.action !== "reject").map((f) => (
              <div key={f.id} className="mono" style={{ display: "flex", gap: 6, alignItems: "center", margin: "3px 0" }}>
                {f.id} prior <input className="field" style={{ width: 64 }} inputMode="decimal" value={meas[f.id]?.p ?? s.measurements.find((m) => m.finding_id === f.id)?.prior_mm ?? ""} onChange={(e) => setMeas((m) => ({ ...m, [f.id]: { c: m[f.id]?.c ?? String(s.measurements.find((x) => x.finding_id === f.id)?.current_mm ?? ""), p: e.target.value } }))} /> mm
                current <input className="field" style={{ width: 64 }} inputMode="decimal" value={meas[f.id]?.c ?? s.measurements.find((m) => m.finding_id === f.id)?.current_mm ?? ""} onChange={(e) => setMeas((m) => ({ ...m, [f.id]: { p: m[f.id]?.p ?? String(s.measurements.find((x) => x.finding_id === f.id)?.prior_mm ?? ""), c: e.target.value } }))} /> mm
              </div>
            ))}
            <button className="btn" onClick={saveMeas} disabled={s.state === "NEEDS_HUMAN" || Object.keys(meas).length === 0}>Apply measurements <kbd>M</kbd></button>
            <div className="mono" style={{ marginTop: 6 }}>{s.recist?.line ?? "RECIST 1.1: not computed. No confirmed measurements."}</div>
          </section>}
        </div>
      </div>

      <div className="strip">
        <span className="label">Indication</span>{" "}
        {head.indication ? <><span className="mono muted">released {hhmmss(s.indication_released_at)} after blind reads</span><Syn /> <span>{head.indication}</span></> :
          <span className="mono muted">held by Charge. Released only for the focused pass.</span>}
        {head.indication && lb?.indication_pass && <div style={{ marginTop: 4 }}><span className="label">Focused pass</span> {lb.indication_pass.answer}</div>}
        {lb && lb.prior_report_discrepancies.map((d, i) => <div key={i} className="flag mono">Prior report says: {d.prior_report_says}. Images show: {d.images_show}</div>)}
      </div>

      <div className="pane">
        <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <span className="label">Report draft (editable, template order)</span>
          <span className={`mono ${s.qc.pass ? "" : "flag"}`}>QC: {s.report_draft ? (s.qc.pass ? "pass" : `${s.qc.mismatches.length} mismatch`) : "—"} <span className="muted">({s.qc.mode === "model+code" ? "model + code" : "code checks only"})</span></span>
          {s.report_edited && <span className="flag mono">edited by hand</span>}
        </div>
        {s.qc.mismatches.map((m, i) => <div key={i} className="flag mono">{m.type}{m.finding_id ? ` (${m.finding_id})` : ""}: {m.why}</div>)}
        {s.report_draft ? <>
          <textarea className="report" value={reportText ?? (s.signed_report ?? s.report_draft)} readOnly={s.state === "NEEDS_HUMAN"} onChange={(e) => setReportText(e.target.value)} aria-label="Report draft" />
          <button className="btn" disabled={reportText === null || s.drafting} onClick={() => act(async () => { await api(`/api/cases/${id}/report`, { text: reportText }); setReportText(null); })}>
            {locked ? "Save edit (creates a new version)" : "Save report edit"}</button>
        </> : <div className="muted mono">{s.state === "NEEDS_HUMAN" ? "No AI draft." : "Draft not ready."}</div>}
      </div>

      <div className="sign-bar">
        <span>Resident: {reviewedN} of {findings.length} reviewed</span>
        <button className="btn" disabled={!canResident} onClick={signRes}>Sign as resident</button>
        <button className="btn primary" disabled={!canAttending} onClick={signAtt} title={canAttending ? "" : "Disabled until every finding is reviewed and the resident has signed"}>Attending sign <kbd>⌘↵</kbd></button>
        {s.resident_signed && <span className="muted">resident {hhmmss(s.resident_signed.ts)} v{s.resident_signed.version}</span>}
        {s.signature && <span className="muted">attending {hhmmss(s.signature.ts)} v{s.signature.version}</span>}
        <span style={{ flex: 1 }} />
        <span className="muted">{s.mode === "live" ? `Lightbox ${s.models.lightbox} · Stat, Courier, QC ${s.models.sonnet}` : "fixture mode"}{s.models.fell_back ? " · Fable unavailable, Lightbox ran on claude-opus-5-5" : ""}</span>
      </div>
    </main>
  );
}
