import { readImage, validId } from "@/lib/store";
export async function GET(_: Request, ctx: { params: Promise<{ id: string; which: string }> }) {
  const { id, which } = await ctx.params;
  if (!validId(id) || (which !== "prior" && which !== "current")) return new Response("not found", { status: 404 });
  try { return new Response(new Uint8Array(readImage(id, which)), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }); }
  catch { return new Response("not found", { status: 404 }); }
}
