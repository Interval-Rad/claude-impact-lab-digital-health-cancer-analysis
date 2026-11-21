import { view } from "@/lib/charge";
import { handle, idOf, type Ctx } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = async (_: Request, ctx: Ctx) => { const id = await idOf(ctx); return handle(() => view(id)); };
