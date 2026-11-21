import { NextResponse } from "next/server";
import { assertCaseId, loadImage } from "@/lib/cases";
import { sniffMediaType } from "@/lib/images";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; which: string }> }) {
  const { id, which } = await params;
  if (which !== "prior" && which !== "current") return notFound();
  try {
    assertCaseId(id);
    const bytes = loadImage(id, which);
    // Media type from the first bytes, never from the file extension.
    const mediaType = sniffMediaType(bytes);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mediaType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
