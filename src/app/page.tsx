import Link from "next/link";
import { getWorklist } from "@/components/data";
import { MockTag, Syn, clockTime, dateAndTime, words } from "@/components/format";
import UploadForm from "@/components/UploadForm";
import type { WorklistRow } from "@/components/types";
import { BANNER } from "@/lib/config";

export const dynamic = "force-dynamic";

const HANDOFF_STATES = new Set(["DELIVERED", "ACKNOWLEDGED", "PATIENT_INFORMED"]);
const TIER_SHAPE: Record<string, string> = { critical: "▲", high: "◆", routine: "○" };

function Tier({ row }: { row: WorklistRow }) {
  if (!row.tier) return <span className="data text-muted">— not triaged</span>;
  return (
    <span className={`data whitespace-nowrap ${row.tier === "critical" ? "text-critical" : ""}`}>
      <span aria-hidden="true">{TIER_SHAPE[row.tier]}</span> {row.tier}
      {row.page_on_call && <span className="attn block">on-call paged</span>}
    </span>
  );
}

function Agreement({ flag }: { flag: WorklistRow["agreement_flag"] }) {
  if (flag === null) return <span className="data text-muted">—</span>;
  if (flag === "reads_agree") return <span className="data whitespace-nowrap">reads agree</span>;
  return (
    <span className="data attn whitespace-nowrap">{flag === "one_of_two" ? "1 of 2 !" : "reads disagree !"}</span>
  );
}

export default function WorklistPage() {
  const rows = getWorklist();
  const anyMock = rows.some((r) => r.mock);
  return (
    <div>
      <div className="strip">
        <span className="data">{BANNER}</span>
        <span className="data ml-auto text-muted">{rows.length} studies</span>
      </div>
      {anyMock && (
        <div className="strip">
          <MockTag />
          <span className="data">
            Rows tagged mock come from a hand-written placeholder fixture, not model output.
          </span>
        </div>
      )}
      <div className="px-[10px] pt-2 pb-1">
        <h1 className="label">Worklist</h1>
        <p className="mt-1 text-muted">
          Plain sort on the columns shown: tier, then severity subgroup, then low agreement first, then arrival
          (oldest first). Studies not run yet are listed last.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="worklist">
          <thead>
            <tr>
              <th scope="col">Tier</th>
              <th scope="col">Severity subgroup</th>
              <th scope="col">Agreement</th>
              <th scope="col">Patient</th>
              <th scope="col">Exam</th>
              <th scope="col">Indication</th>
              <th scope="col">Context flags</th>
              <th scope="col">State</th>
              <th scope="col">Arrived</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.case_id}>
                <td style={r.tier === "critical" ? { borderLeft: "3px solid var(--accent)" } : undefined}><Tier row={r} /></td>
                <td className="data">
                  {r.severity_subgroup ? words(r.severity_subgroup) : <span className="text-muted">—</span>}
                </td>
                <td><Agreement flag={r.agreement_flag} /></td>
                <td>
                  <Link href={`/case/${r.case_id}`} className="row-link data underline underline-offset-2">
                    {r.case_id}
                  </Link>{" "}
                  {r.mock && <MockTag />}
                  {r.patient ? (
                    <div>
                      {r.patient} <Syn />
                    </div>
                  ) : (
                    <div className="text-muted">no chart on file</div>
                  )}
                  {r.mrn && (
                    <div className="data text-muted">
                      MRN {r.mrn} <Syn />
                    </div>
                  )}
                </td>
                <td>
                  {r.exam && <div className="data">{r.exam}</div>}
                  <div className="data text-muted">
                    views: prior {r.views.prior}, current {r.views.current}
                  </div>
                </td>
                <td className="max-w-[26ch]">
                  {r.indication_released_at && r.indication ? (
                    <>
                      {r.indication} <Syn />
                      <div className="data text-muted">released {clockTime(r.indication_released_at)}</div>
                    </>
                  ) : (
                    <span className="data text-muted">held until focused pass</span>
                  )}
                </td>
                <td>
                  {r.context_flags.length === 0 ? (
                    <span className="data text-muted">—</span>
                  ) : (
                    r.context_flags.map((c) => (
                      <div key={c} className="data">
                        {c} <Syn />
                      </div>
                    ))
                  )}
                </td>
                <td className="data">
                  {r.state}
                  {!r.has_draft && <div className="text-muted">No AI draft</div>}
                  {HANDOFF_STATES.has(r.state) && (
                    <div>
                      <Link href={`/case/${r.case_id}/handoff`} className="relative z-10 underline underline-offset-2">
                        handoff
                      </Link>
                    </div>
                  )}
                </td>
                <td className="data whitespace-nowrap">
                  {r.arrived_at ? (
                    <>
                      {dateAndTime(r.arrived_at)} <Syn />
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="border-b border-rule">
        <summary className="label cursor-pointer px-[10px] py-2">Upload a pair</summary>
        <UploadForm />
      </details>
    </div>
  );
}
