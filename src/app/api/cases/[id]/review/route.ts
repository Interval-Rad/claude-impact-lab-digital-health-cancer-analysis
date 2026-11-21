import { review } from "@/lib/charge";
import { body, handle, idOf, type Ctx } from "@/lib/http";
export const POST = async (req: Request, ctx: Ctx) => { const id = await idOf(ctx); const b = await body<Parameters<typeof review>[1]>(req); return handle(async () => { await review(id, b); return { ok: true }; }); };
