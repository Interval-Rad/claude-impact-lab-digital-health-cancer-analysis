import { informed } from "@/lib/charge";
import { handle, idOf, type Ctx } from "@/lib/http";
export const POST = async (_: Request, ctx: Ctx) => { const id = await idOf(ctx); return handle(() => ({ state: informed(id).state })); };
