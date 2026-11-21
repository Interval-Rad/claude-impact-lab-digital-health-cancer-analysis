import { signAttending, signResident } from "@/lib/charge";
import { body, handle, idOf, type Ctx } from "@/lib/http";
export const POST = async (req: Request, ctx: Ctx) => {
  const id = await idOf(ctx); const b = await body<{ role: "resident" | "attending"; name?: string }>(req);
  return handle(async () => { const s = b.role === "attending" ? await signAttending(id, b.name) : signResident(id, b.name); return { state: s.state }; });
};
