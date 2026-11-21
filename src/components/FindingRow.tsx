"use client";
import { useId, useState } from "react";
import type { BlindFinding, MergedFinding, Status } from "@/lib/schemas";
import { AgreementMark, StatusMark, words } from "./format";
import type { Review } from "./types";

type Props = {
  finding: MergedFinding;
  review: Review | null;
  selected: boolean;
  onSelect: () => void;
  onReview: (review: Review | null) => void;
};

const REVIEW_MARK: Record<Review["action"], string> = {
  accepted: "● accepted",
  edited: "◐ edited",
  rejected: "✕ rejected",
};

function ReadLine({ name, status, read }: { name: string; status: Status | null; read: BlindFinding | null }) {
  return (
    <tr className="align-top">
      <th scope="row" className="data whitespace-nowrap pr-3 text-left font-normal text-blind">{name}</th>
      <td className="whitespace-nowrap pr-3"><StatusMark status={status} /></td>
      <td>{read ? read.evidence : <span className="text-muted">This read did not report the finding.</span>}</td>
    </tr>
  );
}

export default function FindingRow({ finding: f, review, selected, onSelect, onReview }: Props) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<"edit" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [text, setText] = useState(f.description);

  const rule = review === null ? "ai-draft" : review.action === "rejected" ? "ai-rejected" : "ai-accepted";
  const shownText = review?.action === "edited" && review.text ? review.text : f.description;

  const openForm = (which: "edit" | "reject") => {
    setReason(review?.action === (which === "edit" ? "edited" : "rejected") ? review.reason ?? "" : "");
    setText(shownText);
    setForm(which);
  };
  const submit = () => {
    if (!form || reason.trim() === "") return;
    onReview(form === "edit" ? { action: "edited", reason: reason.trim(), text: text.trim() } : { action: "rejected", reason: reason.trim() });
    setForm(null);
  };

  return (
    <li className={`border-t border-rule py-[6px] first:border-t-0 ${selected ? "bg-surface" : ""}`}>
      <div className={rule}>
        <button
          type="button"
          className="grid w-full grid-cols-[3.5ch_1fr_auto_auto] items-baseline gap-x-3 text-left"
          aria-expanded={open}
          aria-controls={`${uid}-detail`}
          onClick={() => {
            setOpen((v) => !v);
            if (!selected) onSelect();
          }}
        >
          <span className="data font-medium">{f.id}</span>
          <span className="data">
            {words(f.region)} <span className="text-muted">{words(f.kind)}</span>
          </span>
          <StatusMark status={f.status} />
          <AgreementMark finding={f} />
        </button>

        <div className={review?.action === "rejected" ? "text-muted line-through" : ""}>{shownText}</div>

        <div className="mt-[2px] flex flex-wrap items-center gap-x-2 gap-y-1">
          {f.outside_indication === true && <span className="tag">outside indication</span>}
          {f.time_sensitive && <span className="data attn text-[11px]">time sensitive !</span>}
          <span className="data text-[11px] text-muted">
            {review ? REVIEW_MARK[review.action] : "○ draft, not reviewed"}
          </span>
          {review?.reason && <span className="text-[11px] text-muted">Reason: {review.reason}</span>}
          <span className="ml-auto flex gap-1">
            <button
              type="button" className="btn" aria-pressed={review?.action === "accepted"}
              onClick={() => { setForm(null); onReview({ action: "accepted" }); }}
            >
              Accept
            </button>
            <button type="button" className="btn" aria-pressed={review?.action === "edited"} aria-expanded={form === "edit"} onClick={() => openForm("edit")}>
              Edit
            </button>
            <button type="button" className="btn" aria-pressed={review?.action === "rejected"} aria-expanded={form === "reject"} onClick={() => openForm("reject")}>
              Reject
            </button>
            {review && (
              <button type="button" className="btn" onClick={() => { setForm(null); onReview(null); }}>
                Undo
              </button>
            )}
          </span>
        </div>

        {form && (
          <form
            className="mt-1 border border-rule bg-raised p-2"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            {form === "edit" && (
              <label className="mb-1 block">
                <span className="label block">Your wording for {f.id}</span>
                <textarea className="field block w-full resize-y" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            )}
            <label className="block">
              <span className="label block">Reason for {form === "edit" ? "the edit" : "rejecting"} {f.id} (required)</span>
              <input
                className="field block w-full" value={reason} onChange={(e) => setReason(e.target.value)}
                autoFocus required
              />
            </label>
            <div className="mt-1 flex justify-end gap-1">
              <button type="button" className="btn" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn" disabled={reason.trim() === "" || (form === "edit" && text.trim() === "")}>
                {form === "edit" ? "Save edit" : "Confirm reject"}
              </button>
            </div>
          </form>
        )}

        <div id={`${uid}-detail`} hidden={!open} className="mt-1 border-t border-rule pt-1">
          <div>
            <span className="data">Evidence:</span> {f.evidence}
          </div>
          <div className="data text-[11px] text-muted">
            size change in words: {f.size_change_words === null ? "the two reads used different words" : words(f.size_change_words)}
            {f.needs_measurement ? ", needs your measurement" : ""}
          </div>
          {f.added_in_focused_pass ? (
            <div className="data mt-1 text-[11px]">
              Added in the focused pass, after the indication was released. Not part of the two blind reads.
            </div>
          ) : (
            <table className="mt-1 w-full">
              <caption className="label text-left">Blind reads</caption>
              <tbody>
                <ReadLine name="read A" status={f.read_a_status} read={f.reads.a} />
                <ReadLine name="read B" status={f.read_b_status} read={f.reads.b} />
              </tbody>
            </table>
          )}
        </div>
      </div>
    </li>
  );
}
