import { NextResponse } from "next/server";
import { ChargeError } from "./charge";
import { validId } from "./store";

export type Ctx = { params: Promise<{ id: string }> };
export async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!validId(id)) throw new ChargeError("bad case id", 400);
  return id;
}
export async function handle(fn: () => Promise<unknown> | unknown) {
  try { return NextResponse.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (e) {
    const status = e instanceof ChargeError ? e.status : (e as { code?: string }).code === "ENOENT" ? 404 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
export async function body<T>(req: Request): Promise<T> { try { return (await req.json()) as T; } catch { return {} as T; } }
