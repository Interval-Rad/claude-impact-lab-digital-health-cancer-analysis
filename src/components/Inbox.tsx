"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markInformed, openResult, signOrder, type ApiResult } from "./api";
import { Syn, clockTime } from "./format";
import type { CasePayload, InboxItem } from "./types";

export const LOCKED_TEXT = "Locked. Nothing leaves radiology before the attending signs.";
const TIER_SHAPE: Record<string, string> = { critical: "▲", high: "◆", routine: "○" };
const DEMO_CLOCK = "demo clock: 60 min = 20 s";

function Tier({ tier }: { tier: string }) {
  return (
    <span className={`data whitespace-nowrap ${tier === "critical" ? "text-critical" : ""}`}>
      <span aria-hidden="true">{TIER_SHAPE[tier] ?? ""}</span> {tier}
    </span>
  );
}

/** Milliseconds left to the deadline, ticking. null until mounted (the server cannot know the viewer's clock). */
function useRemaining(deadline: string | null, active: boolean): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline || !active) {
      setLeft(null);
      return;
    }
    const end = Date.parse(deadline);
    const tick = () => setLeft(end - Date.now());
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [deadline, active]);
  return left;
}

function Countdown({ deadline }: { deadline: string }) {
  const left = useRemaining(deadline, true);
  if (left === null) return <span className="data text-muted">deadline {clockTime(deadline)}</span>;
  if (left <= 0) return <span className="data attn">! deadline passed, not opened</span>;
  // 20 real seconds stand for 60 demo minutes.
  const demoMin = Math.ceil(left / 1000) * 3;
  return (
    <span className="data whitespace-nowrap">
      open within {demoMin} min <span className="text-muted">({Math.ceil(left / 1000)} s)</span>
    </span>
  );
}

function Escalations({ payload }: { payload: CasePayload }) {
  const d = payload.delivery;
  const left = useRemaining(d?.deadline_at ?? null, !!d && !d.opened_at);
  if (!d) return null;
  const overdue = !d.opened_at && left !== null && left <= 0;
  if (d.escalations.length === 0 && !overdue) return null;
  return (
    <div className="border-b border-rule px-4 py-3" role="status">
      <div className="label mb-1">Escalation</div>
      {d.escalations.length === 0 ? (
        <div className="data attn">! Deadline passed and the result is not opened. Escalation is due.</div>
      ) : (
        <ul className="m-0 list-none p-0">
          {d.escalations.map((e, i) => (
            <li key={i} className="data attn">
              ! escalated {clockTime(e.at)}: {e.action}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Inbox({ items, selected }: { items: InboxItem[]; selected: CasePayload | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escalations are written by the server. Poll while anything is unopened so they appear live.
  const anyUnopened = items.some((i) => !i.opened_at);
  useEffect(() => {
    if (!anyUnopened) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [anyUnopened, router]);

  const selectedId = selected?.case_id ?? null;
  useEffect(() => setError(null), [selectedId]);

  async function act(name: string, fn: (id: string) => Promise<ApiResult>) {
    if (!selectedId || busy) return;
    setBusy(name);
    setError(null);
    const r = await fn(selectedId);
    if (!r.ok) setError(r.error);
    setBusy(null);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="text-[16px] leading-[1.5]">
        <div className="strip">
          <h1 className="label">Ordering provider inbox</h1>
        </div>
        <p className="px-4 py-4">No signed results yet. Results appear here only after the attending signs.</p>
      </div>
    );
  }

  const signed = !!selected?.signature?.attending;
  const handoff = signed ? selected?.handoff ?? null : null;
  const delivery = signed ? selected?.delivery ?? null : null;
  const opened = !!delivery?.opened_at;
  const order = handoff?.followup_order ?? null;

  return (
    <div className="flex min-h-full flex-col text-[16px] leading-[1.5]">
      <div className="strip">
        <h1 className="label">Ordering provider inbox</h1>
        <span className="data ml-auto text-[12px] text-muted">
          {items.length} signed {items.length === 1 ? "result" : "results"}, {items.filter((i) => !i.opened_at).length} unopened
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Messages" className="shrink-0 border-b border-rule md:w-[340px] md:border-r md:border-b-0">
          <ul className="m-0 list-none p-0">
            {items.map((m) => {
              const current = m.case_id === selectedId;
              const timed = !m.opened_at && m.deadline_at && m.tier !== "routine";
              return (
                <li key={m.case_id} className="border-b border-rule">
                  <Link
                    href={`/inbox?case=${encodeURIComponent(m.case_id)}`}
                    aria-current={current ? "true" : undefined}
                    className={`block px-4 py-3 hover:bg-surface ${current ? "bg-raised" : ""}`}
                    style={{ borderLeft: `3px solid ${current ? "var(--text)" : "transparent"}` }}
                  >
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <Tier tier={m.tier} />
                      <span className="data">{m.opened_at ? "○ opened" : "● unopened"}</span>
                    </div>
                    <div className={m.opened_at ? "" : "font-semibold"}>{m.subject}</div>
                    <div className="text-[13px] text-muted">
                      {m.patient ? (
                        <>
                          {m.patient} <Syn />
                        </>
                      ) : (
                        <span className="data">{m.case_id}</span>
                      )}
                      {m.mrn && (
                        <span className="data">
                          {" "}
                          MRN {m.mrn} <Syn />
                        </span>
                      )}
                    </div>
                    <div className="data text-[13px] text-muted">sent {clockTime(m.sent_at)}</div>
                    {timed && (
                      <div className="text-[13px]">
                        <Countdown deadline={m.deadline_at!} />
                      </div>
                    )}
                    {m.escalated && <div className="data attn text-[13px]">! escalated</div>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-label="Selected result" className="min-w-0 flex-1">
          {!selected ? (
            <p className="px-4 py-4">Select a message.</p>
          ) : !signed || !handoff || !delivery ? (
            <p className="px-4 py-4">{LOCKED_TEXT}</p>
          ) : (
            <div className="max-w-[76ch]">
              <div className="border-b border-rule px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
                  <Tier tier={delivery.tier} />
                  <span className="data">{selected.case_id}</span>
                  {selected.header.display_name && (
                    <span>
                      {selected.header.display_name} <Syn />
                    </span>
                  )}
                  {selected.header.mrn && (
                    <span className="data">
                      MRN {selected.header.mrn} <Syn />
                    </span>
                  )}
                </div>
                <div className="data mt-1 text-[13px] text-muted">
                  attending signed {clockTime(selected.signature?.attending?.at)}
                  {selected.signature?.attending?.by ? ` by ${selected.signature.attending.by}` : ""} · sent{" "}
                  {clockTime(delivery.sent_at)} · {delivery.how} ·{" "}
                  {opened ? `opened ${clockTime(delivery.opened_at)}` : "not opened"}
                </div>
                {!opened && delivery.deadline_at && delivery.tier !== "routine" && (
                  <div className="mt-2 text-[14px]">
                    <Countdown deadline={delivery.deadline_at} /> <span className="data text-[12px] text-muted">{DEMO_CLOCK}</span>
                  </div>
                )}
              </div>

              <Escalations payload={selected} />

              {error && (
                <div className="data attn border-b border-rule px-4 py-2" role="alert">
                  ! {error}
                </div>
              )}

              {!opened ? (
                <div className="border-b border-rule px-4 py-4">
                  <h2 className="m-0 text-[18px] font-semibold">{handoff.provider_message.subject}</h2>
                  <p className="mt-2 text-muted">
                    This result is unopened. Opening it records the time and stops the escalation timer.
                  </p>
                  <button
                    type="button" className="btn mt-2 !px-3 !py-1 !text-[14px]" disabled={busy !== null}
                    onClick={() => act("open", openResult)}
                  >
                    {busy === "open" ? "Opening" : "Open result"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="border-b border-rule px-4 py-4">
                    <div className="label mb-1">What changed and what the radiologist recommends</div>
                    <h2 className="m-0 text-[18px] font-semibold">{handoff.provider_message.subject}</h2>
                    <p className="mt-2 whitespace-pre-wrap">{handoff.provider_message.body}</p>
                  </div>

                  <div className="border-b border-rule px-4 py-4">
                    <div className="label mb-1">Follow-up order (draft, for your signature)</div>
                    {order ? (
                      <>
                        <table className="w-full border-collapse text-[15px]">
                          <tbody>
                            {(
                              [
                                ["Study", order.study],
                                ["Body part", order.body_part],
                                ["Contrast", order.contrast],
                                ["Interval", order.interval],
                                ["Reason", order.reason],
                              ] as const
                            ).map(([k, v]) => (
                              <tr key={k}>
                                <th scope="row" className="label w-[14ch] border-b border-rule py-1 pr-3 text-left align-top font-normal">
                                  {k}
                                </th>
                                <td className="border-b border-rule py-1">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[13px] text-muted">
                          Pre-filled from the signed report. Nothing is ordered until you sign it.
                        </p>
                        <div className="mt-2 flex items-baseline gap-3">
                          {delivery.order_signed_at ? (
                            <span className="data">■ signed {clockTime(delivery.order_signed_at)}</span>
                          ) : (
                            <>
                              <button
                                type="button" className="btn !px-3 !py-1 !text-[14px]" disabled={busy !== null}
                                onClick={() => act("order", signOrder)}
                              >
                                {busy === "order" ? "Signing" : "Sign order"}
                              </button>
                              <span className="data text-[13px] text-muted">□ draft, not signed</span>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="m-0">The signed report recommends no follow-up order.</p>
                    )}
                  </div>

                  <div className="border-b border-rule px-4 py-4">
                    <div className="label mb-1">Patient</div>
                    <div className="flex flex-wrap items-baseline gap-3">
                      {selected.patient_informed ? (
                        <span className="data">■ patient informed</span>
                      ) : (
                        <>
                          <button
                            type="button" className="btn !px-3 !py-1 !text-[14px]" disabled={busy !== null}
                            onClick={() => act("informed", markInformed)}
                          >
                            {busy === "informed" ? "Saving" : "Mark patient informed"}
                          </button>
                          <span className="data text-[13px] text-muted">□ patient not yet informed</span>
                        </>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] text-muted">Voice: not built in this demo</p>
                  </div>

                  <details className="border-b border-rule px-4 py-3">
                    <summary className="label cursor-pointer">Full signed report</summary>
                    {selected.report_draft ? (
                      <pre className="data mt-2 whitespace-pre-wrap text-[14px]">{selected.report_draft}</pre>
                    ) : (
                      <p className="mt-2 text-muted">No report text on file.</p>
                    )}
                  </details>

                  <div className="px-4 py-3 text-[13px]">
                    <Link href={`/case/${selected.case_id}/handoff`} className="underline underline-offset-2">
                      Handoff drafts
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
