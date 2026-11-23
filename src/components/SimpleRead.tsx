"use client";
// The case screen. One column of decisions next to the two films, and one next step at a time.
// Everything the fuller record holds is still here, under "More".
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MergedFinding } from "@/lib/schemas";
import * as api from "./api";
import { Syn, clockTime } from "./format";
import { agreementWord, changeWord, comparableWord, findingName, stateWord, tierWord } from "./plain";
import type { CasePayload, Review } from "./types";

const RUNNING = ["BLIND_READING", "RECONCILED", "FOCUSED", "TRIAGED"];
const SENT = ["DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"];

function Films({ p }: { p: CasePayload }) {
  const [flip, setFlip] = useState(false);
  const [showing, setShowing] = useState<"prior" | "current">("prior");
  const [invert, setInvert] = useState(false);
  const pane = (which: "prior" | "current") => (
    <figure className="relative m-0 min-w-0 flex-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.images[which]} alt={`${which === "prior" ? "Earlier" : "Current"} chest X-ray, ${p.header[which].view} view`}
        className="block w-full" style={{ filter: invert ? "invert(1)" : "none" }}
      />
      <figcaption className="absolute left-2 top-2 bg-black px-2 py-[2px] text-[13px]">
        <b>{which === "prior" ? "BEFORE" : "NOW"}</b> {p.header[which].date ?? ""} · {p.header[which].view} view
      </figcaption>
    </figure>
  );
  return (
    <div>
      <div className="image-well flex gap-[2px]">{flip ? pane(showing) : [<div key="a" className="flex-1">{pane("prior")}</div>, <div key="b" className="flex-1">{pane("current")}</div>]}</div>
      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
        <button type="button" className="ez-btn" aria-pressed={!flip} onClick={() => setFlip(false)}>Side by side</button>
        <button type="button" className="ez-btn" aria-pressed={flip} onClick={() => { setFlip(true); setShowing((s) => (flip ? (s === "prior" ? "current" : "prior") : "prior")); }}>
          {flip ? `Flip (showing ${showing === "prior" ? "before" : "now"})` : "Flip between them"}
        </button>
        <button type="button" className="ez-btn" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>Invert</button>
      </div>
    </div>
  );
}

function FindingItem({
  f, review, locked, onReview,
}: { f: MergedFinding; review: Review | undefined; locked: boolean; onReview: (r: Review | null) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "reject" | "edit">(null);
  const [reason, setReason] = useState("");
  const [text, setText] = useState(f.description);
  const agree = agreementWord(f);
  const submit = () => {
    if (!reason.trim()) return;
    onReview(mode === "edit" ? { action: "edited", reason: reason.trim(), text: text.trim() } : { action: "rejected", reason: reason.trim() });
    setMode(null);
    setReason("");
  };
  return (
    <li className="ez-row">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{findingName(f)}</span>
        <span className="ez-chip">{changeWord(f.status)}</span>
        <span className={`ez-chip ${agree.warn ? "warn" : ""}`}>{agree.text}</span>
      </div>
      {review?.action === "edited" && review.text && <div className="mt-1">{review.text}</div>}
      {open && (
        <div className="mt-2 text-muted">
          <p className="text-text">{f.description}</p>
          <p>Why: {f.evidence}</p>
          <p>
            First read: {f.read_a_status ? changeWord(f.read_a_status) : "did not report it"}. Second read:{" "}
            {f.read_b_status ? changeWord(f.read_b_status) : "did not report it"}.
            {f.outside_indication ? " Not related to the reason for the scan." : ""}
          </p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {review ? (
          <>
            <span className={`ez-chip ${review.action === "rejected" ? "" : "ok"}`}>
              {review.action === "accepted" ? "✓ Confirmed" : review.action === "edited" ? "✎ Reworded" : "✕ Rejected"}
            </span>
            {review.reason && <span className="text-muted">Reason: {review.reason}</span>}
            {!locked && <button type="button" className="ez-btn" onClick={() => onReview(null)}>Undo</button>}
          </>
        ) : (
          !locked && (
            <>
              <button type="button" className="ez-btn" onClick={() => onReview({ action: "accepted" })}>✓ Confirm</button>
              <button type="button" className="ez-btn" aria-expanded={mode === "reject"} onClick={() => setMode(mode === "reject" ? null : "reject")}>✕ Reject</button>
              <button type="button" className="ez-btn" aria-expanded={mode === "edit"} onClick={() => setMode(mode === "edit" ? null : "edit")}>✎ Reword</button>
            </>
          )
        )}
        <button type="button" className="ez-link ml-auto text-muted" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide details" : "Details"}
        </button>
      </div>
      {mode && !review && (
        <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {mode === "edit" && (
            <textarea className="ez-input" rows={2} aria-label={`Your wording for ${findingName(f)}`} value={text} onChange={(e) => setText(e.target.value)} />
          )}
          <div className="flex gap-2">
            <input
              className="ez-input flex-1" autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "edit" ? "Why are you rewording it? (required)" : "Why are you rejecting it? (required)"}
              aria-label="Reason"
            />
            <button type="submit" className="ez-btn" disabled={!reason.trim() || (mode === "edit" && !text.trim())}>Save</button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function SimpleRead({ payload: p }: { payload: CasePayload }) {
  const router = useRouter();
  const lb = p.lightbox;
  const findings = lb?.findings ?? [];
  const [reviews, setReviews] = useState<Record<string, Review>>(p.reviews ?? {});
  const [pending, setPending] = useState<string | null>(null); // a click is being sent
  const [error, setError] = useState<string | null>(null);
  const [showAllCd, setShowAllCd] = useState(false);
  const [report, setReport] = useState(p.report_draft ?? "");

  const residentSigned = Boolean(p.signature?.resident);
  const attendingSigned = Boolean(p.signature?.attending);
  const sent = SENT.includes(p.state);
  const working = RUNNING.includes(p.state) || Boolean(p.busy) || pending !== null;
  const awaitingOpen = Boolean(p.delivery && !p.delivery.opened_at && p.delivery.deadline_at);
  const reviewed = findings.filter((f) => reviews[f.id]).length;
  const allReviewed = lb !== null && reviewed === findings.length;

  useEffect(() => {
    if (!RUNNING.includes(p.state) && !p.busy && !awaitingOpen) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [p.state, p.busy, awaitingOpen, router]);

  async function act(label: string, call: () => Promise<api.ApiResult>) {
    setPending(label);
    setError(null);
    const r = await call();
    if (!r.ok) setError(r.error);
    setPending(null);
    router.refresh();
    return r.ok;
  }
  async function setReview(id: string, review: Review | null) {
    setReviews((prev) => {
      const next = { ...prev };
      if (review) next[id] = review; else delete next[id];
      return next;
    });
    const r = await api.reviewFinding(p.case_id, id, review);
    if (!r.ok) { setError(r.error); router.refresh(); } else setError(null);
  }
  async function acceptAll() {
    setPending("Confirming");
    for (const f of findings) if (!reviews[f.id]) await setReview(f.id, { action: "accepted" });
    setPending(null);
    router.refresh();
  }

  // Abstentions tied to the look-first findings come first. Nothing is dropped.
  const rank = (id: string | null) => { const i = id ? (lb?.look_first ?? []).indexOf(id) : -1; return i === -1 ? (id ? 50 : 99) : i; };
  const cant = [...(lb?.cant_determine ?? [])].sort((a, b) => rank(a.related_finding) - rank(b.related_finding));
  const firstDiff = lb?.comparability.differences[0];
  const step = sent ? 4 : attendingSigned ? 4 : residentSigned ? 3 : allReviewed ? 2 : 1;
  const steps = ["Review", "Resident signs", "Attending signs", "Sent to provider"];
  const replayed = (p.calls ?? []).filter((c) => c.replayed);

  // ---------- the one next step ----------
  let next: React.ReactNode;
  if (p._mock) next = <span className="text-muted">Placeholder case. Nothing to sign.</span>;
  else if (working) next = <button type="button" className="ez-btn ez-primary" disabled>{pending ?? p.busy ?? p.status_text ?? "Working"} …</button>;
  else if (!lb) next = (
    <button type="button" className="ez-btn ez-primary" onClick={() => act("Starting", () => api.runCase(p.case_id))}>
      {p.state === "NEEDS_HUMAN" ? "Try the AI read again" : "Run the AI first read"}
    </button>
  );
  else if (sent) next = <Link href={`/inbox?case=${p.case_id}`} className="ez-btn ez-primary">See what the provider received</Link>;
  else if (attendingSigned) next = <button type="button" className="ez-btn ez-primary" disabled>Sending to the provider …</button>;
  else if (residentSigned) next = <button type="button" className="ez-btn ez-primary" onClick={() => act("Signing", () => api.sign(p.case_id, "attending"))}>Sign as attending</button>;
  else if (allReviewed) next = <button type="button" className="ez-btn ez-primary" onClick={() => act("Signing", () => api.sign(p.case_id, "resident"))}>Sign as resident</button>;
  else next = <button type="button" className="ez-btn ez-primary" onClick={acceptAll}>Confirm all {findings.length - reviewed} remaining</button>;

  return (
    <div className="ez flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule bg-surface px-4 py-2">
        <Link href="/" className="ez-link">← All cases</Link>
        <span className="font-medium">{p.header.display_name ?? p.case_id}</span>
        {p.header.display_name && <Syn />}
        <ol className="ez-steps ml-auto" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined}>
              {i + 1 < step ? "✓" : `${i + 1}.`} {s}{i < steps.length - 1 ? "  ›" : ""}
            </li>
          ))}
        </ol>
      </div>
      <div className="shrink-0 border-b border-rule px-4 py-[6px] text-[13px]">
        {attendingSigned ? (
          <span>● Signed by the attending at {clockTime(p.signature?.attending?.at)}.</span>
        ) : (
          <span className="font-medium">{p.banner}</span>
        )}
        <span className="text-muted"> Demo only. Patient details are synthetic.</span>
        {p._mock && <span className="attn"> MOCK FIXTURE: hand-written placeholder, not model output.</span>}
        {p.replay && <span className="text-muted"> Replay mode: recorded responses, no model is called.</span>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <div className="min-h-0 overflow-y-auto border-r border-rule"><Films p={p} /></div>

        <div className="min-h-0 overflow-y-auto p-4">
          {!lb ? (
            <div className="ez-panel">
              <h2>{p.state === "NEEDS_HUMAN" ? "No AI draft for this study" : RUNNING.includes(p.state) ? "The AI is reading" : "Not read yet"}</h2>
              <p>
                {p.state === "NEEDS_HUMAN"
                  ? "The AI draft was stopped by a safety check, so a person reads this study without it."
                  : RUNNING.includes(p.state)
                  ? `${p.status_text ?? "Working"}. This takes two to three minutes.`
                  : "Press the button below to have the AI compare the two films."}
              </p>
              {p.error && <p className="attn mt-2">What happened: {p.error} !</p>}
            </div>
          ) : (
            <div className="grid gap-4">
              <section className="ez-panel" aria-labelledby="h-bottom">
                <h2 id="h-bottom">{attendingSigned ? "Bottom line (signed)" : "Bottom line (AI draft, not final)"}</h2>
                {p.indication && (
                  <p className="text-muted">
                    Question: {p.indication} <Syn />
                  </p>
                )}
                <p className="mt-1 text-[17px] leading-snug">{lb.indication_pass?.answer ?? "No answer was drafted for this study."}</p>
                <p className="mt-3">
                  {comparableWord(lb.comparability.comparable)}
                  {firstDiff ? `. ${firstDiff.detail}` : "."}
                </p>
                {p.stat && <p className="mt-1 text-muted">Priority: {tierWord(p.stat.urgency_tier)}. {p.stat.worklist_reason}</p>}
              </section>

              {cant.length > 0 && (
                <section className="ez-panel" aria-labelledby="h-cant">
                  <h2 id="h-cant">What the AI could not tell ({cant.length})</h2>
                  <ul>
                    {(showAllCd ? cant : cant.slice(0, 2)).map((c, i) => (
                      <li key={i} className="ez-cd">
                        <div className="font-medium">{c.question}</div>
                        <div><b>Suggested next step:</b> {c.recommend}</div>
                        <details><summary>Why</summary><div className="text-muted">{c.reason}</div></details>
                      </li>
                    ))}
                  </ul>
                  {cant.length > 2 && (
                    <button type="button" className="ez-link mt-2 text-muted" aria-expanded={showAllCd} onClick={() => setShowAllCd((v) => !v)}>
                      {showAllCd ? "Show fewer" : `Show ${cant.length - 2} more`}
                    </button>
                  )}
                </section>
              )}

              <section className="ez-panel" aria-labelledby="h-find">
                <h2 id="h-find">Findings to confirm ({reviewed} of {findings.length} done)</h2>
                {findings.length === 0 ? <p>No findings were reported.</p> : (
                  <ul>
                    {findings.map((f) => (
                      <FindingItem key={f.id} f={f} review={reviews[f.id]} locked={residentSigned} onReview={(r) => setReview(f.id, r)} />
                    ))}
                  </ul>
                )}
              </section>

              <details className="ez-panel">
                <summary>More: full report, measurements, technical detail</summary>
                <div className="mt-3 grid gap-4">
                  <div>
                    <h2>Report draft {p.qc ? (p.qc.pass ? "(checked against the findings: pass)" : "(check found mismatches !)") : ""}</h2>
                    <textarea
                      className="ez-input w-full font-mono text-[13px]" rows={14} value={report} disabled={attendingSigned}
                      aria-label="Report draft" onChange={(e) => setReport(e.target.value)}
                      onBlur={() => { if (report !== (p.report_draft ?? "")) void act("Saving", () => api.saveReportDraft(p.case_id, report)); }}
                    />
                    {p.qc && !p.qc.pass && p.qc.mismatches.map((m, i) => <p key={i} className="attn">{m.why} !</p>)}
                  </div>
                  <div>
                    <h2>Measurements (typed by the radiologist)</h2>
                    {findings.filter((f) => f.needs_measurement).map((f) => {
                      const m = p.measurements.find((x) => x.finding_id === f.id);
                      const save = (k: "prior_mm" | "current_mm", v: string) => {
                        const n = v.trim() === "" ? null : Number(v);
                        if (n !== null && (!Number.isFinite(n) || n < 0)) return;
                        void act("Saving", () => api.saveMeasurement(p.case_id, { finding_id: f.id, prior_mm: m?.prior_mm ?? null, current_mm: m?.current_mm ?? null, [k]: n }));
                      };
                      return (
                        <div key={f.id} className="flex flex-wrap items-center gap-2 py-1">
                          <span className="min-w-[16ch]">{findingName(f)}</span>
                          <label>before <input type="number" min={0} step={0.1} className="ez-input w-[8ch]" defaultValue={m?.prior_mm ?? ""} disabled={attendingSigned} onBlur={(e) => save("prior_mm", e.target.value)} /> mm</label>
                          <label>now <input type="number" min={0} step={0.1} className="ez-input w-[8ch]" defaultValue={m?.current_mm ?? ""} disabled={attendingSigned} onBlur={(e) => save("current_mm", e.target.value)} /> mm</label>
                        </div>
                      );
                    })}
                    <p className="text-muted">{p.recist?.line ?? "RECIST 1.1: not computed"}. The AI never measures.</p>
                  </div>
                  <div>
                    <h2>Why the comparison is limited</h2>
                    {lb.comparability.differences.length === 0 ? <p>No technical differences were noted.</p> : lb.comparability.differences.map((d, i) => (
                      <p key={i}>{d.detail} <span className="text-muted">This prevents: {d.prevents}</span></p>
                    ))}
                    {lb.study_flags.length > 0 && <p className="attn">The two reads disagree on whether the films can be compared !</p>}
                  </div>
                  {lb.prior_report_discrepancies.length > 0 && (
                    <div>
                      <h2>Where the images differ from the earlier report</h2>
                      {p.prior_report && <p className="text-muted">Earlier report: {p.prior_report} <Syn /></p>}
                      {lb.prior_report_discrepancies.map((d, i) => <p key={i}>The report says: {d.prior_report_says} The images show: {d.images_show}</p>)}
                    </div>
                  )}
                  <div className="text-[13px] text-muted">
                    <h2>Technical</h2>
                    <p>State: {p.state} ({stateWord(p.state)}). The reason for the scan was released to the AI at {clockTime(p.indication_released_at)}, after both blind reads.</p>
                    <p>Models: {[...new Set((p.calls ?? []).map((c) => c.model))].join(", ") || "none"}.{replayed.length > 0 ? ` Replayed, recorded ${clockTime(replayed[replayed.length - 1].recorded_at)} (${replayed.length} of ${(p.calls ?? []).length} calls).` : ""}</p>
                    {(p.code_checks ?? []).filter((c) => !c.pass).map((c) => <p key={c.check} className="attn">Safety check failed: {c.check} !</p>)}
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule bg-surface px-4 py-3">
        <span>
          {sent ? `● Sent to ${p.ordering_provider?.name ?? "the ordering provider"}${p.delivery?.opened_at ? ", opened" : ", not opened yet"}.`
            : attendingSigned ? "● Signed by the attending."
            : residentSigned ? "● Signed by the resident. The attending signs next."
            : lb ? (allReviewed ? "● All findings confirmed. Ready to sign." : `${reviewed} of ${findings.length} findings confirmed.`) : ""}
        </span>
        {p.delivery?.escalations.map((e, i) => <span key={i} className="attn">{e.action} !</span>)}
        {(error || (lb && p.error)) && <span className="attn" role="alert">{error ?? p.error} !</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {p.can_reset && !working && (reviewed > 0 || residentSigned || p.state === "NEEDS_HUMAN") && (
            <button type="button" className="ez-btn" title="Clear reviews and signatures and go back to the AI draft" onClick={async () => { if (await act("Resetting", () => api.resetCase(p.case_id))) setReviews({}); }}>
              Start over
            </button>
          )}
          {next}
        </span>
      </div>
    </div>
  );
}
