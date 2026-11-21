import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const MODELS = { lightbox: "claude-fable-5-2", lightboxFallback: "claude-opus-5-5", sonnet: "claude-sonnet-5-5" } as const;

/** Live mode needs a key on the server. Without one the app runs on labelled fixtures. */
export function llmMode(): "live" | "fixture" {
  if (process.env.INTERVAL_READ_FIXTURES === "1") return "fixture";
  return process.env.ANTHROPIC_API_KEY ? "live" : "fixture";
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/png"; data: string } };
export const text = (t: string): Block => ({ type: "text", text: t });
export const png = (b64: string): Block => ({ type: "image", source: { type: "base64", media_type: "image/png", data: b64 } });

export type CallResult<T> = { data: T; model: string; fellBack: boolean };

/**
 * One tool per agent, forced tool choice, zod validation, one retry with the validation error attached.
 */
export async function callTool<T>(opts: {
  model: string; fallbackModel?: string; system: string; content: Block[];
  toolName: string; schema: z.ZodType<T>; maxTokens?: number;
  /** Code-level QC. Return an error message to trigger the one retry. */
  refine?: (data: T) => string | null;
}): Promise<CallResult<T>> {
  const input_schema = z.toJSONSchema(opts.schema) as Anthropic.Tool["input_schema"];
  delete (input_schema as Record<string, unknown>)["$schema"];
  const tool: Anthropic.Tool = { name: opts.toolName, description: "Return the result as structured JSON.", input_schema };

  let model = opts.model, fellBack = false;
  const attempt = async (extra?: string): Promise<unknown> => {
    const content = extra ? [...opts.content, text(extra)] : opts.content;
    for (;;) {
      try {
        const res = await getClient().messages.create({
          model, max_tokens: opts.maxTokens ?? 8000, system: opts.system,
          tools: [tool], tool_choice: { type: "tool", name: opts.toolName },
          messages: [{ role: "user", content: content as Anthropic.ContentBlockParam[] }],
        });
        const use = res.content.find((b) => b.type === "tool_use");
        if (!use || use.type !== "tool_use") throw new Error("model returned no tool_use block");
        return use.input;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (!fellBack && opts.fallbackModel && status && [400, 402, 403, 404].includes(status)) {
          model = opts.fallbackModel; fellBack = true; continue; // Fable unavailable: say so in the UI footer
        }
        throw e;
      }
    }
  };

  const check = (raw: unknown): { ok: true; data: T } | { ok: false; error: string } => {
    const p = opts.schema.safeParse(raw);
    if (!p.success) return { ok: false, error: p.error.message };
    const bad = opts.refine?.(p.data);
    return bad ? { ok: false, error: bad } : { ok: true, data: p.data };
  };
  const r1 = check(await attempt());
  if (r1.ok) return { data: r1.data, model, fellBack };
  const r2 = check(await attempt(`Your previous output failed validation. Fix it and return the full JSON again.\nValidation error: ${r1.error}`));
  if (r2.ok) return { data: r2.data, model, fellBack };
  throw new Error(`Validation failed twice for ${opts.toolName}: ${r2.error}`);
}
