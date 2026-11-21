"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { CaseState } from "@/lib/types";
import { Copy, Syn, usePoll, VoiceButton } from "@/components/common";

type View = { head: { display_name: string }; state: (CaseState & { banner: string }) | null };
const TABS = ["Ordering provider", "Follow-up order", "Tumor board", "Surgeon", "Family", "PCP", "Navigator", "Oncology note", "FHIR"] as const;

export default function Handoff() {
  const { id } = useParams<{ id: string }>();
  const { data } = usePoll<View>(`/api/cases/${id}`, 1500);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Ordering provider");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const s = data?.state;
  if (!data) return <main className="pane muted mono">Loading</main>;
  const d = s?.delivery;
  if (!s || !s.signature || !d) return (
    <main className="pane"><div className="banner"><b className="flag">LOCKED</b><span>Nothing leaves radiology before the attending signs.</span></div>
      <p className="mono">State: {s?.state ?? "not started"}. <Link href={`/case/${id}`}>← Read screen</Link></p></main>
  );
  const content: Record<(typeof TABS)[number], string> = {
    "Ordering provider": `${d.provider_message.subject}\n\n${d.provider_message.body}\n\nEpic chat draft:\n${d.epic_chat_draft}`,
    "Follow-up order": d.followup_order ? Object.entries(d.followup_order).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nDRAFT. The provider signs this order. No agent places an order." : "The signed report recommends no follow-up study.",
    "Tumor board": d.tumor_board, Surgeon: d.surgeon, Family: d.family_page, PCP: d.pcp_summary,
    Navigator: d.navigator_referral ? JSON.stringify({ ...d.navigator_referral, patient_letter: undefined }, null, 2) + `\n\nPatient letter (${d.navigator_referral.patient_letter.language}, ${d.navigator_referral.patient_letter.reading_level}):\n${d.navigator_referral.patient_letter.text}` : "No navigator trigger fired, or no follow-up is recommended.",
    "Oncology note": d.oncology_note_draft, FHIR: JSON.stringify(d.fhir_diagnostic_report, null, 2),
  };
  const val = edits[tab] ?? content[tab]; const informed = s.state === "PATIENT_INFORMED";
  return (
    <main>
      <div className="banner rule-b"><b>SIGNED</b><span className="mono muted">{s.signature.who} · {new Date(s.signature.ts).toLocaleTimeString()} · v{s.signature.version}</span><Syn />
        <span className="muted">Every tab is an editable draft for a clinician.</span><span style={{ flex: 1 }} /><Link href={`/case/${id}`}>← Read screen</Link></div>
      <div className="tabs">{TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
      <div className="pane" style={{ maxWidth: 900 }}>
        <div className="mono muted" style={{ marginBottom: 6 }}>Delivery: tier {d.tier} · sent {new Date(d.sent_at).toLocaleTimeString()} · {s.state}{d.escalated ? " · re-sent and escalated" : ""}</div>
        {tab === "Family" ? <>
          <div className="serif" style={{ whiteSpace: "pre-wrap" }}>{val}</div>
          <p style={{ marginTop: 10 }}><VoiceButton id={id} kind="family_page_read" label="Play family page" unlocked={informed} /></p>
          <p><VoiceButton id={id} kind="scheduling_call" label="Play scheduling call" unlocked={informed} /></p>
        </> : <textarea className="report" style={{ minHeight: 320 }} value={val} onChange={(e) => setEdits((x) => ({ ...x, [tab]: e.target.value }))} aria-label={tab} />}
        <p><Copy text={val} /></p>
      </div>
    </main>
  );
}
