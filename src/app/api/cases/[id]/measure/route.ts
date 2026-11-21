import { measure } from "@/lib/charge";
import type { Measurement } from "@/lib/recist";
import { body, handle, idOf, type Ctx } from "@/lib/http";
export const POST = async (req: Request, ctx: Ctx) => { const id = await idOf(ctx); const b = await body<{ measurements: Measurement[] }>(req); return handle(async () => { const s = await measure(id, b.measurements ?? []); return { recist: s.recist }; }); };
