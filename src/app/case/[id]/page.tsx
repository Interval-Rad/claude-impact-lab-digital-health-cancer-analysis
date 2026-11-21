import { notFound } from "next/navigation";
import { getCasePayload } from "@/components/data";
import ReadScreen from "@/components/ReadScreen";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getCasePayload(id);
  if (!payload) notFound();
  return <ReadScreen payload={payload} />;
}
