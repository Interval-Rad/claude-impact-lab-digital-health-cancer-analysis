import { notFound } from "next/navigation";
import { getCasePayload } from "@/components/data";
import SimpleRead from "@/components/SimpleRead";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getCasePayload(id);
  if (!payload) notFound();
  // Remount when the server moves the case on, so the screen never shows stale local state.
  const key = [
    payload.state, payload.version, payload.busy, payload.report_draft?.length, payload.lightbox?.findings.length,
    payload.signature?.resident?.at, payload.signature?.attending?.at, payload.qc?.pass,
  ].join("|");
  return <SimpleRead key={key} payload={payload} />;
}
