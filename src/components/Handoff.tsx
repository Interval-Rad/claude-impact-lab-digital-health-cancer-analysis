"use client";
import { Source_Serif_4 } from "next/font/google";
import { useState } from "react";
import type { CourierHandoff } from "@/lib/schemas";

const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], display: "swap", fallback: ["Georgia", "Times New Roman", "serif"] });

const TABS = [
  ["provider", "Ordering provider"],
  ["order", "Follow-up order"],
  ["board", "Tumor board"],
  ["surgeon", "Surgeon"],
  ["family", "Family"],
] as const;
type TabId = (typeof TABS)[number][0];

const ORDER_FIELDS = [
  ["study", "Study"],
  ["body_part", "Body part"],
  ["contrast", "Contrast"],
  ["interval", "Interval"],
  ["reason", "Reason"],
] as const;
const RECIST_COLS = [
  ["lesion", "Lesion"],
  ["prior", "Prior"],
  ["current", "Current"],
  ["change", "Change"],
] as const;

function CopyButton({ text }: { text: () => string }) {
  const [note, setNote] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setNote("copied");
    } catch {
      setNote("! copy failed: clipboard not available");
    }
    setTimeout(() => setNote(""), 2500);
  }
  return (
    <span className="flex items-baseline gap-2">
      <button type="button" className="btn" onClick={copy}>
        Copy
      </button>
      <span role="status" className={`data text-[11px] ${note.startsWith("!") ? "attn" : "text-muted"}`}>
        {note}
      </span>
    </span>
  );
}

function Area({ id, label, value, onChange, rows = 8, className = "" }: {
  id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; className?: string;
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="label mb-1 block">
        {label}
      </label>
      <textarea
        id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)}
        className={`field ai-draft w-full max-w-[90ch] !font-sans !text-[13px] ${className}`}
      />
    </div>
  );
}

// Each tab is an editable draft. Edits are local to this screen: nothing is saved or sent from here.
export default function Handoff({ handoff }: { handoff: CourierHandoff }) {
  const [tab, setTab] = useState<TabId>("provider");
  const [d, setD] = useState<CourierHandoff>(handoff);
  const order = d.followup_order;
  const rows = d.tumor_board.recist_rows;

  const copyText: Record<TabId, () => string> = {
    provider: () => `${d.provider_message.subject}\n\n${d.provider_message.body}`,
    order: () => (order ? ORDER_FIELDS.map(([k, l]) => `${l}: ${order[k]}`).join("\n") : ""),
    board: () =>
      [
        rows.length
          ? [RECIST_COLS.map(([, l]) => l).join("\t"), ...rows.map((r) => RECIST_COLS.map(([k]) => r[k]).join("\t"))].join("\n")
          : "No confirmed measurements.",
        `History\n${d.tumor_board.history}`,
        `Impression\n${d.tumor_board.impression}`,
      ].join("\n\n"),
    surgeon: () => d.surgeon,
    family: () => d.family_page,
  };

  function onTabKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex(([id]) => id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div>
      <div className="strip">
        <div role="tablist" aria-label="Handoff drafts" className="flex flex-wrap gap-1" onKeyDown={onTabKey}>
          {TABS.map(([id, label]) => (
            <button
              key={id} id={`tab-${id}`} type="button" role="tab" className="btn"
              aria-selected={tab === id} aria-pressed={tab === id} aria-controls="handoff-panel"
              tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="data ml-auto text-[11px] text-muted">editable drafts, edits stay on this screen</span>
      </div>

      <div id="handoff-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="px-[10px] py-3">
        <div className="mb-3 flex items-baseline gap-4">
          <h2 className="label m-0">{TABS.find(([id]) => id === tab)![1]}</h2>
          {!(tab === "order" && !order) && <CopyButton text={copyText[tab]} />}
        </div>

        {tab === "provider" && (
          <>
            <div className="mb-3">
              <label htmlFor="ho-subject" className="label mb-1 block">
                Subject
              </label>
              <input
                id="ho-subject" className="field ai-draft w-full max-w-[90ch] !font-sans !text-[13px]"
                value={d.provider_message.subject}
                onChange={(e) => setD({ ...d, provider_message: { ...d.provider_message, subject: e.target.value } })}
              />
            </div>
            <Area
              id="ho-body" label="Message" rows={12} value={d.provider_message.body}
              onChange={(v) => setD({ ...d, provider_message: { ...d.provider_message, body: v } })}
            />
          </>
        )}

        {tab === "order" &&
          (order ? (
            <>
              <table className="w-full max-w-[90ch] border-collapse">
                <tbody>
                  {ORDER_FIELDS.map(([k, label]) => (
                    <tr key={k}>
                      <th scope="row" className="w-[14ch] border-b border-rule py-1 pr-3 text-left font-normal">
                        <label htmlFor={`ho-order-${k}`} className="label">
                          {label}
                        </label>
                      </th>
                      <td className="border-b border-rule py-1">
                        <input
                          id={`ho-order-${k}`} className="field w-full" value={order[k]}
                          onChange={(e) => setD({ ...d, followup_order: { ...order, [k]: e.target.value } })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-muted">
                Draft only. The ordering provider signs the order in the inbox. No agent places an order.
              </p>
            </>
          ) : (
            <p className="m-0">The signed report recommends no follow-up order.</p>
          ))}

        {tab === "board" && (
          <>
            <div className="label mb-1">Measurements (entered by the radiologist)</div>
            {rows.length === 0 ? (
              <p className="mt-0 mb-3">No confirmed measurements.</p>
            ) : (
              <table className="worklist mb-3 max-w-[90ch]">
                <thead>
                  <tr>
                    {RECIST_COLS.map(([k, label]) => (
                      <th key={k} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {RECIST_COLS.map(([k, label]) => (
                        <td key={k}>
                          <input
                            aria-label={`${label}, row ${i + 1}`} className="field w-full" value={r[k]}
                            onChange={(e) =>
                              setD({
                                ...d,
                                tumor_board: {
                                  ...d.tumor_board,
                                  recist_rows: rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)),
                                },
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Area
              id="ho-history" label="History" rows={5} value={d.tumor_board.history}
              onChange={(v) => setD({ ...d, tumor_board: { ...d.tumor_board, history: v } })}
            />
            <Area
              id="ho-impression" label="Impression" rows={5} value={d.tumor_board.impression}
              onChange={(v) => setD({ ...d, tumor_board: { ...d.tumor_board, impression: v } })}
            />
          </>
        )}

        {tab === "surgeon" && (
          <Area id="ho-surgeon" label="Note for the surgeon" rows={12} value={d.surgeon} onChange={(v) => setD({ ...d, surgeon: v })} />
        )}

        {tab === "family" && (
          <>
            <div className="mb-3">
              <label htmlFor="ho-family" className="label mb-1 block">
                Page for the patient and family
              </label>
              <textarea
                id="ho-family" rows={14} value={d.family_page} onChange={(e) => setD({ ...d, family_page: e.target.value })}
                className={`${serif.className} ai-draft w-full max-w-[64ch] rounded-[2px] border border-rule bg-bg px-3 py-2 text-[20px] leading-[1.6] text-text`}
              />
            </div>
            <p className="data m-0 text-muted">Audio: not built in this demo</p>
          </>
        )}
      </div>
    </div>
  );
}
