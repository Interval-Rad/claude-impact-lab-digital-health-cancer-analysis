import Link from "next/link";
import { notFound } from "next/navigation";
import Handoff from "@/components/Handoff";
import { getCasePayload } from "@/components/data";
import { clockTime } from "@/components/format";

export const dynamic = "force-dynamic";

// Handoff drafts. Exists only after the attending signature: before that this screen shows the lock and nothing else.
export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getCasePayload(id);
  if (!payload) notFound();
  const attending = payload.signature?.attending ?? null;
  const resident = payload.signature?.resident ?? null;
  const handoff = attending ? payload.handoff ?? null : null;
  const d = attending ? payload.delivery ?? null : null;
  const links = (
    <span className="data ml-auto flex gap-4">
      <Link href={`/case/${payload.case_id}`} className="underline underline-offset-2">
        back to case
      </Link>
      <Link href="/inbox" className="underline underline-offset-2">
        provider inbox
      </Link>
    </span>
  );

  if (!attending) {
    return (
      <div>
        <div className="strip">
          <span className="data">{payload.banner}</span>
          <span className="data text-muted">state: {payload.state}</span>
        </div>
        <div className="strip">
          <h1 className="label">Handoff</h1>
          <span className="data">{payload.case_id}</span>
          {links}
        </div>
        <p className="px-[10px] py-3 text-[14px]">
          <span aria-hidden="true">■ </span>Locked. Nothing leaves radiology before the attending signs.
        </p>
        <p className="px-[10px]">
          <Link href={`/case/${payload.case_id}`} className="underline underline-offset-2">
            Return to the case to review and sign
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="strip flex-wrap">
        <h1 className="label">Handoff</h1>
        <span className="data">{payload.case_id}</span>
        <span className="data">
          ■ attending signed {clockTime(attending.at)}
          {attending.by ? ` by ${attending.by}` : ""}
        </span>
        {resident && (
          <span className="data text-muted">
            resident signed {clockTime(resident.at)}
            {resident.by ? ` by ${resident.by}` : ""}
          </span>
        )}
        {links}
      </div>
      <div className="strip flex-wrap">
        <span className="label">Delivery</span>
        {d ? (
          <>
            <span className="data">sent {clockTime(d.sent_at)}</span>
            <span className="data text-muted">{d.how}</span>
            <span className="data">{d.opened_at ? `○ opened ${clockTime(d.opened_at)}` : "● not opened"}</span>
            {d.escalations.length === 0 ? (
              <span className="data text-muted">no escalations</span>
            ) : (
              d.escalations.map((e, i) => (
                <span key={i} className="data attn">
                  ! escalated {clockTime(e.at)}: {e.action}
                </span>
              ))
            )}
            {d.order_signed_at && <span className="data">order signed {clockTime(d.order_signed_at)}</span>}
            {payload.patient_informed && <span className="data">patient informed</span>}
          </>
        ) : (
          <span className="data text-muted">not sent yet</span>
        )}
      </div>
      {handoff ? (
        <Handoff handoff={handoff} />
      ) : (
        <p className="px-[10px] py-3">
          Signed. Handoff drafts are not ready yet{payload.status_text ? `: ${payload.status_text}` : "."} Reload to check.
        </p>
      )}
    </div>
  );
}
