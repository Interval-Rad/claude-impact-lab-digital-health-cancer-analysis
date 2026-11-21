// Small display helpers shared by the worklist and the read screen.
import type { MergedFinding, Status } from "@/lib/schemas";

/** "R_upper" -> "R upper", "nodule_or_mass" -> "nodule or mass". */
export const words = (s: string) => s.replace(/_/g, " ");

/** HH:MM:SS as written in the timestamp (no timezone shift: the demo clock is the record). */
export function clockTime(iso: string | null | undefined): string {
  const m = iso ? /T(\d{2}:\d{2}:\d{2})/.exec(iso) : null;
  return m ? m[1] : "—";
}

export function dateAndTime(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso) : null;
  return m ? `${m[1]} ${m[2]}` : "—";
}

// Status is a word plus a shape. The shape is a plain text glyph, never colour alone.
const STATUS_SHAPE: Record<Status, string> = {
  new: "◆", // filled diamond
  increased: "▲", // up triangle
  decreased: "▼", // down triangle
  stable: "■", // square
  resolved: "○", // open circle
  indeterminate: "◇", // open diamond
};

export function StatusMark({ status }: { status: Status | null }) {
  if (status === null) return <span className="data text-muted">— not reported</span>;
  return (
    <span className="data whitespace-nowrap">
      <span aria-hidden="true">{STATUS_SHAPE[status]}</span> {status}
    </span>
  );
}

/** Agreement between the two blind reads. This is the only certainty signal shown anywhere. */
export function AgreementMark({ finding }: { finding: Pick<MergedFinding, "agreement" | "added_in_focused_pass"> }) {
  if (finding.added_in_focused_pass) return <span className="data whitespace-nowrap">focused pass</span>;
  switch (finding.agreement) {
    case "2_of_2":
      return <span className="data whitespace-nowrap">2 of 2</span>;
    case "1_of_2":
      return (
        <span className="data attn whitespace-nowrap" title="Seen on one read of two">
          1 of 2 !
        </span>
      );
    case "status_differs":
      return (
        <span className="data attn whitespace-nowrap" title="Both reads saw it and gave different statuses">
          reads disagree !
        </span>
      );
    default:
      return <span className="data text-muted">—</span>;
  }
}

export function Syn() {
  return <span className="tag">synthetic</span>;
}

export function MockTag() {
  return <span className="tag tag-mock">mock</span>;
}
