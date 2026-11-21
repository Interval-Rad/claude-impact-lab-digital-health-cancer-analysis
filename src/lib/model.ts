// Every model call goes through callModel().
// - Output is constrained to the agent's JSON schema (structured outputs) and validated with zod.
//   The spec asked for forced tool choice; claude-fable-5-2 and claude-sonnet-5-5 reject forced
//   tool_choice with a 400, so the schema is enforced with output_config.format instead.
// - One retry, with the validation error attached.
// - The request hash and the response are written to data/cache/.
// - DEMO_MODE=replay serves stored responses and never calls the API.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { isReplay, MAX_TOKENS, REQUIRED_MODELS } from "./config";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

export interface CallMeta {
  agent: string;
  label: string;
  model: string; // the model that answered, as reported by the API
  requested_model: string;
  request_hash: string;
  replayed: boolean;
  recorded_at: string; // ISO time the response was produced
  attempts: number;
  usage: { input_tokens: number; output_tokens: number } | null;
}

export class ModelCallError extends Error {
  constructor(message: string, readonly agent: string, readonly label: string) {
    super(`${agent}/${label}: ${message}`);
    this.name = "ModelCallError";
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Put it in .env.local (server side only), or run with DEMO_MODE=replay."
    );
  }
  // Fable reads of two images can take minutes: allow 10 minutes, and let the SDK retry 429/5xx.
  client ??= new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 2 });
  return client;
}

/** Lists the models this API key can use and throws, naming any configured id that is missing. */
export async function assertModelsAvailable(required: string[] = REQUIRED_MODELS): Promise<string[]> {
  if (isReplay()) return [];
  const available: string[] = [];
  for await (const m of getClient().models.list()) available.push(m.id);
  const missing = required.filter((id) => !available.includes(id));
  if (missing.length) {
    throw new Error(
      `Model id(s) not available to this API key: ${missing.join(", ")}. ` +
        `Edit src/lib/config.ts. Available: ${available.join(", ")}`
    );
  }
  return available;
}

export interface CallOptions<S extends z.ZodType> {
  agent: "lightbox" | "stat" | "courier" | "charge";
  /** Distinguishes calls with identical requests, e.g. blind_A and blind_B. Part of the cache key, not of the request. */
  label: string;
  caseId: string;
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[];
  schema: S;
  maxTokens?: number;
}

function buildRequest<S extends z.ZodType>(o: CallOptions<S>, messages: Anthropic.MessageParam[]) {
  return {
    model: o.model,
    max_tokens: o.maxTokens ?? MAX_TOKENS,
    system: o.system,
    messages,
    output_config: { format: zodOutputFormat(o.schema) },
  };
}

export function requestHash<S extends z.ZodType>(o: CallOptions<S>): string {
  const request = buildRequest(o, [{ role: "user", content: o.content }]);
  return crypto.createHash("sha256").update(`${o.caseId}\n${o.label}\n${JSON.stringify(request)}`).digest("hex");
}

function cachePath(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.json`);
}

export async function callModel<S extends z.ZodType>(o: CallOptions<S>): Promise<{ data: z.infer<S>; meta: CallMeta }> {
  const hash = requestHash(o);
  const base = { agent: o.agent, label: o.label, requested_model: o.model, request_hash: hash };

  if (isReplay()) {
    if (!fs.existsSync(cachePath(hash))) {
      throw new ModelCallError(
        "DEMO_MODE=replay but no recorded response exists for this exact request. Record it once in live mode.",
        o.agent, o.label
      );
    }
    const stored = JSON.parse(fs.readFileSync(cachePath(hash), "utf8"));
    const parsed = o.schema.safeParse(stored.response);
    if (!parsed.success) throw new ModelCallError(`recorded response no longer matches the schema: ${parsed.error.message}`, o.agent, o.label);
    return { data: parsed.data, meta: { ...base, model: stored.model, replayed: true, recorded_at: stored.recorded_at, attempts: 0, usage: stored.usage ?? null } };
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: o.content }];
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await getClient().messages.parse(buildRequest(o, messages));
    if (response.stop_reason === "refusal") {
      throw new ModelCallError(`the model declined the request (${response.stop_details?.category ?? "no category"})`, o.agent, o.label);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelCallError("output was cut off at max_tokens", o.agent, o.label);
    }
    const validated = o.schema.safeParse(response.parsed_output);
    if (validated.success) {
      const recorded_at = new Date().toISOString();
      const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(
        cachePath(hash),
        JSON.stringify({ ...base, case_id: o.caseId, model: response.model, recorded_at, usage, response: validated.data }, null, 2)
      );
      return { data: validated.data, meta: { ...base, model: response.model, replayed: false, recorded_at, attempts: attempt, usage } };
    }
    lastError = validated.error.message;
    messages.push(
      { role: "assistant", content: response.content as Anthropic.ContentBlockParam[] },
      { role: "user", content: `Your output failed schema validation:\n${lastError}\nReturn the corrected JSON only.` }
    );
  }
  throw new ModelCallError(`schema validation failed twice: ${lastError}`, o.agent, o.label);
}
