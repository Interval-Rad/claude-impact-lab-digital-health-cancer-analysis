"use client";
import Link from "next/link";
import { useState } from "react";
import type { MergedFinding } from "@/lib/schemas";
import * as api from "./api";
import FindingRow from "./FindingRow";
import { Syn, clockTime, words } from "./format";
import ImageWell from "./ImageWell";
import type { CasePayload, Review } from "./types";

type Sig = { at: string; local: boolean } | null;
type Mm = { prior: string; current: string };

const COMPARABLE_SHAPE: Record<string, string> = { yes: "●", limited: "◐", no: "✕" };

const toMm = (s: string): number | null | undefined => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined: not a usable number
};

export default function ReadScreen({ payload }: { payload: CasePayload }) {
  const lb = payload.lightbox;
  const findings: MergedFinding[] = lb?.findings ?? [];
  const byId = new Map(findings.map((f) => [f.id, f]));

  const [state, setState] = useState(payload.state);
  const [reviews, setReviews] = useState<Record<string, Review>>(payload.reviews ?? {});
  const [selected, setSelected] = useState<string | null>(null);
  const [mm, setMm] = useState<Record<string, Mm>>(() =>
    Object.fromEntries(
      payload.measurements.map((m) => [
        m.finding_id,
        { prior: m.prior_mm === null ? "" : String(m.prior_mm), current: m.current_mm === null ? "" : String(m.current_mm) },
      ])
    )
  );
  const [recist, setRecist] = useState(payload.recist);
  const [report, setReport] = useState(payload.report_draft ?? "");
  const [resident, setResident] = useState<Sig>(
    payload.signature?.resident ? { at: payload.signature.resident.at, local: false } : null
  );
  const [attending, setAttending] = useState<Sig>(
    payload.signature?.attending ? { at: payload.signature.attending.at, local: false } : null
  );
  const [localOnly, setLocalOnly] = useState(false); // a stubbed call answered: nothing was saved
  const [error, setError] = useState<string | null>(null);

  const note = (r: api.ApiResult<{ state?: string }>) => {
    if (!r.ok) return setError(r.error);
    setError(null);
    if (r.stub) setLocalOnly(true);
    if (r.state) setState(r.state);
  };

  const reviewed = findings.filter((f) => reviews[f.id]).length;
  const allReviewed = lb !== null && reviewed === findings.length;
  const signedOnServer = attending !== null && !attending.local;

  async function setReview(id: string, review: Review | null) {
    setReviews((prev) => {
      const next = { ...prev };
      if (review) next[id] = review;
      else delete next[id];
      return next;
    });
    note(await api.reviewFinding(payload.case_id, id, review));
  }

  async function commitMm(id: string) {
    const v = mm[id] ?? { prior: "", current: "" };
    const prior_mm = toMm(v.prior);
    const current_mm = toMm(v.current);
    if (prior_mm === undefined || current_mm === undefined) return;
    const r = await api.saveMeasurement(payload.case_id, { finding_id: id, prior_mm, current_mm });
    note(r);
    if (r.ok && r.recist) setRecist(r.recist);
  }

  async function doSign(role: "resident" | "attending") {
    const r = await api.sign(payload.case_id, role);
    note(r);
    if (!r.ok) return;
    const sig = { at: r.at ?? new Date().toISOString(), local: r.stub === true };
    if (role === "resident") setResident(sig);
    else setAttending(sig);
  }

  const sel = selected ? byId.get(selected) : undefined;
  const regionLabel = sel ? `${sel.id}  ${words(sel.region)}  ${words(sel.kind)}` : null;
  const toMeasure = findings.filter((f) => f.needs_measurement);
  const h = payload.header;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Status strip */}
      <div className="strip shrink-0">
        {signedOnServer ? (
          <span className="data">
            <span aria-hidden="true">{"●"}</span> Signed by attending {clockTime(attending?.at)}
          </span>
        ) : (
          <span className="data font-medium">{payload.banner}</span>
        )}
        <span className="data ml-auto">
          <span className="label mr-2">state</span>
          {state}
        </span>
      </div>
      {payload._mock === true && (
        <div className="strip shrink-0" role="note">
          <span className="tag tag-mock">MOCK FIXTURE</span>
          <span className="data">MOCK FIXTURE — hand-written placeholder, not model output</span>
        </div>
      )}
      <div className="strip shrink-0 flex-wrap">
        <Link href="/" className="data underline underline-offset-2">
          Worklist
        </Link>
        <span className="data">
          <span className="label mr-2">case</span>
          {payload.case_id}
        </span>
        {h.display_name ? (
          <span>
            {h.display_name} <Syn />
          </span>
        ) : (
          <span className="text-muted">no chart on file</span>
        )}
        {h.mrn && (
          <span className="data">
            <span className="label mr-2">MRN</span>
            {h.mrn} <Syn />
          </span>
        )}
        {h.exam && <span className="data">{h.exam}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[58fr_42fr] lg:overflow-hidden">
        {/* Left: images, then indication, then report draft */}
        <div className="min-h-0 border-rule lg:overflow-y-auto lg:border-r">
          <ImageWell images={payload.images} prior={h.prior} current={h.current} regionLabel={regionLabel} />

          <section className="section" aria-labelledby="h-indication">
            <div className="section-head">
              <h2 id="h-indication" className="label">Indication</h2>
              {payload.indication_released_at ? (
                <span className="data text-[11px]">
                  released {clockTime(payload.indication_released_at)} after blind reads <Syn />
                </span>
              ) : (
                <span className="data text-[11px] text-muted">held until focused pass</span>
              )}
            </div>
            {payload.indication_released_at && payload.indication ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="label pt-[2px]">Reason</dt>
                <dd>
                  {payload.indication} <Syn />
                </dd>
                {payload.ordering_provider && (
                  <>
                    <dt className="label pt-[2px]">Ordered by</dt>
                    <dd>
                      {payload.ordering_provider.name}, {payload.ordering_provider.role} <Syn />
                    </dd>
                  </>
                )}
                {payload.prior_report && (
                  <>
                    <dt className="label pt-[2px]">Prior report</dt>
                    <dd>
                      {payload.prior_report} <Syn />
                    </dd>
                  </>
                )}
                {lb?.indication_pass && (
                  <>
                    <dt className="label pt-[2px]">Focused pass</dt>
                    <dd className={attending ? "ai-accepted" : "ai-draft"}>
                      <div>{lb.indication_pass.question}</div>
                      <div>{lb.indication_pass.answer}</div>
                      {lb.indication_pass.regions_rechecked.length > 0 && (
                        <div className="data text-muted">
                          rechecked: {lb.indication_pass.regions_rechecked.map(words).join(", ")}
                        </div>
                      )}
                    </dd>
                  </>
                )}
                {lb && lb.prior_report_discrepancies.length > 0 && (
                  <>
                    <dt className="label attn pt-[2px]">Differs from prior report !</dt>
                    <dd className={attending ? "ai-accepted" : "ai-draft"}>
                      {lb.prior_report_discrepancies.map((d, i) => (
                        <div key={i}>
                          Prior report says: {d.prior_report_says} Images show: {d.images_show}
                        </div>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-muted">
                {lb ? "The reason for the scan is held until both blind reads are saved." : "No indication on file."}
              </p>
            )}
            {payload.stat && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-rule pt-2">
                <dt className="label pt-[2px]">Triage</dt>
                <dd>
                  <span className="data">
                    tier {payload.stat.urgency_tier}, {words(payload.stat.severity_subgroup)}
                    {payload.stat.page_on_call && <span className="attn"> , on-call paged !</span>}
                  </span>
                  <div className={attending ? "ai-accepted" : "ai-draft"}>{payload.stat.worklist_reason}</div>
                </dd>
                {payload.stat.context_flags.length > 0 && (
                  <>
                    <dt className="label pt-[2px]">Context</dt>
                    <dd>
                      {payload.stat.context_flags.map((c, i) => (
                        <div key={i}>
                          <span className="data">{c.item}</span> <Syn />{" "}
                          <span className="data text-muted">bears on {c.bears_on}.</span> {c.why}
                        </div>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            )}
          </section>

          <section className="section" aria-labelledby="h-report">
            <div className="section-head">
              <h2 id="h-report" className="label">Report draft (editable, template order)</h2>
              <span className="data text-[11px]">
                {payload.qc === null ? (
                  <span className="text-muted">QC: not run</span>
                ) : payload.qc.pass ? (
                  <>
                    <span aria-hidden="true">{"●"}</span> QC: pass
                  </>
                ) : (
                  <span className="attn">
                    <span aria-hidden="true">{"✕"}</span> QC: fail !
                  </span>
                )}
              </span>
            </div>
            {payload.report_draft === null ? (
              <p className="data">Not run yet. No AI draft.</p>
            ) : (
              <div className={attending ? "ai-accepted" : "ai-draft"}>
                <textarea
                  aria-labelledby="h-report"
                  className="field block w-full resize-y leading-[1.5]"
                  rows={12}
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  onBlur={async () => note(await api.saveReportDraft(payload.case_id, report))}
                  spellCheck={false}
                />
              </div>
            )}
            {payload.qc && !payload.qc.pass && (
              <ul className="mt-2">
                {payload.qc.mismatches.map((m, i) => (
                  <li key={i} className="border-t border-rule py-1">
                    <span className="data attn">{words(m.type)} !</span>{" "}
                    {m.finding_id && <span className="data">{m.finding_id} </span>}
                    <span>&ldquo;{m.report_text}&rdquo;</span> <span className="text-muted">{m.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right rail, in report order */}
        <div className="min-h-0 lg:overflow-y-auto">
          {lb === null ? (
            <section className="section" aria-labelledby="h-status">
              <h2 id="h-status" className="label mb-[6px]">Status</h2>
              <p className="data">Not run yet. No AI draft.</p>
              <p className="mt-1 text-muted">
                The images are on file. No read, triage or report exists for this study. Views shown are the labels
                recorded with the images.
              </p>
            </section>
          ) : (
            <>
              <section className="section" aria-labelledby="h-comp">
                <div className="section-head">
                  <h2 id="h-comp" className="label">Comparability</h2>
                  <span className={`data ${lb.comparability.comparable === "yes" ? "" : "attn"}`}>
                    <span aria-hidden="true">{COMPARABLE_SHAPE[lb.comparability.comparable]}</span>{" "}
                    {lb.comparability.comparable}
                    {lb.comparability.comparable === "yes" ? "" : " !"}
                  </span>
                </div>
                <div className="data text-[11px] text-muted">
                  read A: {lb.comparable_by_read.a}, read B: {lb.comparable_by_read.b}
                </div>
                {lb.study_flags.includes("reads_disagree_on_comparability") && (
                  <div className="data attn">reads disagree on comparability !</div>
                )}
                {lb.comparability.differences.length === 0 ? (
                  <div className="mt-1">No differences between the two studies noted.</div>
                ) : (
                  <ul className="mt-1">
                    {lb.comparability.differences.map((d, i) => (
                      <li key={i} className="ai-draft mb-1">
                        <span className="data">{words(d.factor)}:</span> {d.detail}
                        <div>
                          <span className="data">prevents:</span> {d.prevents}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <table className="data mt-2 w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="font-normal" scope="col"></th>
                      <th className="font-normal" scope="col">view</th>
                      <th className="font-normal" scope="col">rotation</th>
                      <th className="font-normal" scope="col">inspiration</th>
                      <th className="font-normal" scope="col">exposure</th>
                      <th className="font-normal" scope="col">coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["prior", "current"] as const).map((k) => {
                      const q = lb.comparability[k];
                      return (
                        <tr key={k}>
                          <th scope="row" className="pr-2 text-left font-normal text-muted">{k}</th>
                          <td>{q.view}{q.view_inferred ? " (inferred)" : ""}</td>
                          <td>{q.rotation}</td>
                          <td>{q.inspiration}</td>
                          <td>{q.exposure}</td>
                          <td>{q.coverage}{q.artifacts.length > 0 ? `; artifacts: ${q.artifacts.join(", ")}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lb.limits && (
                  <div className="mt-2">
                    <span className="data">limits:</span> {lb.limits}
                  </div>
                )}
              </section>

              <section className="section" aria-labelledby="h-look">
                <h2 id="h-look" className="label mb-[6px]">Look first</h2>
                {lb.look_first.length === 0 ? (
                  <div className="text-muted">Nothing flagged to look at first.</div>
                ) : (
                  <ul>
                    {lb.look_first.map((id) => {
                      const f = byId.get(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className="data w-full py-[2px] text-left hover:bg-surface"
                            aria-pressed={selected === id}
                            onClick={() => setSelected(selected === id ? null : id)}
                          >
                            <span className="attn inline-block w-[3.5ch] font-medium">{id}</span>
                            {f ? `${words(f.region)}  ${words(f.kind)}` : "(not in the findings list)"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="section" aria-labelledby="h-findings">
                <div className="section-head">
                  <h2 id="h-findings" className="label">Findings</h2>
                  <span className="data text-[11px] text-muted">
                    {reviewed} of {findings.length} reviewed
                  </span>
                </div>
                {findings.length === 0 ? (
                  <div>No findings reported by either read.</div>
                ) : (
                  <ul>
                    {findings.map((f) => (
                      <FindingRow
                        key={f.id}
                        finding={f}
                        review={reviews[f.id] ?? null}
                        selected={selected === f.id}
                        onSelect={() => setSelected(selected === f.id ? null : f.id)}
                        onReview={(r) => setReview(f.id, r)}
                      />
                    ))}
                  </ul>
                )}
                <details className="mt-2">
                  <summary className="label cursor-pointer">Systematic read, by area</summary>
                  <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[2px] ${attending ? "ai-accepted" : "ai-draft"}`}>
                    {Object.entries(lb.systematic_read).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="data text-[11px] text-muted">{words(k)}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </section>

              <section className="section" aria-labelledby="h-cant">
                <h2 id="h-cant" className="label mb-[6px]">Can&apos;t determine</h2>
                {lb.cant_determine.length === 0 ? (
                  <div>Nothing listed as undeterminable.</div>
                ) : (
                  <ul>
                    {lb.cant_determine.map((c, i) => (
                      <li key={i} className="hatched border-t border-rule py-[6px] first:border-t-0">
                        <div className="font-medium">{c.question}</div>
                        <div>
                          <span className="data">Reason:</span> {c.reason}
                        </div>
                        <div>
                          <span className="data">Next:</span> {c.recommend}
                        </div>
                        <div className="data text-[11px] text-muted">
                          {c.related_finding ? `relates to ${c.related_finding}, ` : ""}
                          from read{c.from_reads.length === 1 ? "" : "s"} {c.from_reads.join(" and ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="section" aria-labelledby="h-meas">
                <h2 id="h-meas" className="label mb-[6px]">Measurements (you enter)</h2>
                {toMeasure.length === 0 ? (
                  <div>No finding is marked as needing a measurement.</div>
                ) : (
                  <ul>
                    {toMeasure.map((f) => {
                      const v = mm[f.id] ?? { prior: "", current: "" };
                      const bad = toMm(v.prior) === undefined || toMm(v.current) === undefined;
                      const set = (k: keyof Mm, val: string) => setMm((p) => ({ ...p, [f.id]: { ...v, [k]: val } }));
                      return (
                        <li key={f.id} className="data flex flex-wrap items-center gap-x-3 gap-y-1 py-[3px]">
                          <span className="w-[3.5ch] font-medium">{f.id}</span>
                          <span className="text-muted">{words(f.region)}</span>
                          <label>
                            prior{" "}
                            <input
                              type="number" inputMode="decimal" min={0} step={0.1} className="field w-[7ch]"
                              value={v.prior} onChange={(e) => set("prior", e.target.value)} onBlur={() => commitMm(f.id)}
                            />{" "}
                            mm
                          </label>
                          <label>
                            current{" "}
                            <input
                              type="number" inputMode="decimal" min={0} step={0.1} className="field w-[7ch]"
                              value={v.current} onChange={(e) => set("current", e.target.value)} onBlur={() => commitMm(f.id)}
                            />{" "}
                            mm
                          </label>
                          {bad && <span className="attn">enter a number, 0 or more !</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="data mt-1">{recist ? recist.line : "RECIST 1.1: not computed"}</div>
                <div className="text-[11px] text-muted">
                  Only values typed here are measurements. The draft contains no sizes.
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Sign bar, pinned to the bottom of the window */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule bg-surface px-[10px] py-[6px]">
        <span className="data">
          {lb === null ? (
            "Nothing to review. No AI draft."
          ) : (
            <span className={allReviewed ? "" : "attn"}>
              Resident: {reviewed} of {findings.length} reviewed{allReviewed ? "" : " !"}
            </span>
          )}
        </span>
        {resident && (
          <span className="data">
            <span aria-hidden="true">{"●"}</span> resident signed {clockTime(resident.at)}
          </span>
        )}
        {attending && (
          <span className="data">
            <span aria-hidden="true">{"●"}</span> attending signed {clockTime(attending.at)}
          </span>
        )}
        {localOnly && (
          <span className="data text-muted" role="status">
            local only: server calls are stubs, nothing is saved
          </span>
        )}
        {error && (
          <span className="data attn" role="alert">
            {error} !
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button" className="btn" disabled={!allReviewed || resident !== null}
            title={allReviewed ? undefined : "Review every finding first"}
            onClick={() => doSign("resident")}
          >
            Sign as resident
          </button>
          <button
            type="button" className="btn" disabled={!allReviewed || resident === null || attending !== null}
            title={allReviewed && resident ? undefined : "Needs every finding reviewed and the resident signature"}
            onClick={() => doSign("attending")}
          >
            Attending sign
          </button>
        </span>
      </div>
    </div>
  );
}
