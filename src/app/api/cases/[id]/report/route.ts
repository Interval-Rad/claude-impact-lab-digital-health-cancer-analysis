import { editReport } from "@/lib/charge";
import { body, handle, idOf, type Ctx } from "@/lib/http";
export const POST = async (req: Request, ctx: Ctx) => { const id = await idOf(ctx); const b = await body<{ text: string }>(req); return handle(async () => { await editReport(id, String(b.text ?? "")); return { ok: true }; }); };
