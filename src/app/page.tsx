import Link from "next/link";
import { getWorklist } from "@/components/data";
import { MockTag, Syn, dateAndTime } from "@/components/format";
import { stateWord, tierWord } from "@/components/plain";
import type { WorklistRow } from "@/components/types";
import UploadForm from "@/components/UploadForm";
import { BANNER } from "@/lib/config";

export const dynamic = "force-dynamic";

const SENT = new Set(["DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"]);
const SUBGROUP: Record<string, string> = {
  new_lesion_or_possible_new_diagnosis: "possible new finding", urgent_incidental: "urgent incidental finding",
  progression_of_known_disease: "known disease, progressing", indeterminate_needs_human: "unclear, needs a radiologist",
  stable_or_responding: "stable or responding",
};

function reads(flag: WorklistRow["agreement_flag"]) {
  if (flag === null) return null;
  if (flag === "reads_agree") return <span className="ez-chip">The 2 AI reads agree</span>;
  return <span className="ez-chip warn">{flag === "one_of_two" ? "Some findings seen by 1 of 2 reads !" : "The 2 AI reads disagree !"}</span>;
}

export default function WorklistPage() {
  const rows = getWorklist();
  return (
    <div className="ez mx-auto max-w-[1200px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1>Chest X-ray follow-ups</h1>
        <span className="text-muted">{rows.length} studies. Most urgent first.</span>
      </div>
      <p className="mb-4 text-[13px] text-muted">
        {BANNER} Demo only: patient details are synthetic. Order: priority, then type, then studies where the two AI
        reads disagree, then oldest first.
      </p>
      <table className="ez-table">
        <thead>
          <tr>
            <th scope="col">Priority</th>
            <th scope="col">Patient and reason for the scan</th>
            <th scope="col">AI draft says</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.case_id}>
              <td style={r.tier === "critical" ? { borderLeft: "3px solid var(--accent)" } : undefined}>
                <div className={r.tier === "critical" ? "attn font-medium" : "font-medium"}>{tierWord(r.tier)}</div>
                {r.severity_subgroup && <div className="text-[13px] text-muted">{SUBGROUP[r.severity_subgroup] ?? r.severity_subgroup}</div>}
                {r.page_on_call && <div className="attn text-[13px]">on-call paged !</div>}
              </td>
              <td className="max-w-[38ch]">
                <div className="font-medium">
                  {r.patient ?? r.case_id} {r.patient && <Syn />} {r.mock && <MockTag />}
                </div>
                <div className="text-muted">
                  {r.indication_released_at && r.indication ? r.indication : r.has_draft ? "" : "Reason is held until the AI has done its two blind reads."}
                </div>
                <div className="text-[13px] text-muted">Before: {r.views.prior} view. Now: {r.views.current} view.</div>
              </td>
              <td className="max-w-[40ch]">
                {r.summary ? <div>{r.summary}</div> : <div className="text-muted">{r.has_draft ? "" : "No AI draft yet."}</div>}
                <div className="mt-1">{reads(r.agreement_flag)}</div>
              </td>
              <td>
                <div>{stateWord(r.state)}</div>
                {r.arrived_at && <div className="text-[13px] text-muted">arrived {dateAndTime(r.arrived_at)}</div>}
              </td>
              <td className="whitespace-nowrap text-right">
                <Link href={`/case/${r.case_id}`} className="ez-btn ez-primary">
                  {r.has_draft ? (SENT.has(r.state) ? "View" : "Review") : "Open"}
                </Link>
                {SENT.has(r.state) && (
                  <div className="mt-2">
                    <Link href={`/case/${r.case_id}/handoff`} className="ez-link text-[13px]">handoff drafts</Link>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="ez-panel mt-6">
        <summary className="font-medium text-text">+ Upload a new pair of X-rays</summary>
        <div className="mt-3"><UploadForm /></div>
      </details>
    </div>
  );
}
