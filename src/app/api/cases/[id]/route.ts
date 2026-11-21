// Full case state for the UI.
import { NextResponse } from "next/server";
import { getCasePayload } from "@/components/data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = getCasePayload(id);
  return payload ? NextResponse.json(payload) : NextResponse.json({ error: "No such case." }, { status: 404 });
}
