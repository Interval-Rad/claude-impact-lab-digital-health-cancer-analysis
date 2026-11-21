// The blind read. Lightbox calls 1 and 2.
//
// This file receives two images and their view labels. Nothing else reaches it:
// the types below have no field for anything Charge holds back, and
// lightbox.blind.test.ts fails if held-back values appear in the request.
import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "./config";
import { sniffMediaType } from "./images";
import { callModel, type CallMeta } from "./model";
import { lightboxBlindPrompt } from "./prompts";
import { BlindRead } from "./schemas";

export type ViewLabel = "PA" | "AP" | "unknown";

export interface BlindImage {
  bytes: Uint8Array;
  viewLabel: ViewLabel;
}

export interface BlindInput {
  modality: "XR" | "CT_key_slice";
  prior: BlindImage;
  current: BlindImage;
}

function imageBlock(image: BlindImage): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: sniffMediaType(image.bytes), // from the bytes, not the file name
      data: Buffer.from(image.bytes).toString("base64"),
    },
  };
}

/** The complete user content for a blind read: PRIOR, CURRENT, and the view labels. */
export function buildBlindContent(input: BlindInput): Anthropic.ContentBlockParam[] {
  return [
    { type: "text", text: "PRIOR" },
    imageBlock(input.prior),
    { type: "text", text: "CURRENT" },
    imageBlock(input.current),
    {
      type: "text",
      text: JSON.stringify({
        modality: input.modality,
        prior: { view_label: input.prior.viewLabel },
        current: { view_label: input.current.viewLabel },
        corrections: [],
      }),
    },
  ];
}

export type BlindCheck = (read: BlindRead) => string[];

export function blindCall(caseId: string, input: BlindInput, label: "blind_A" | "blind_B", check?: BlindCheck) {
  return {
    check,
    agent: "lightbox" as const,
    label,
    caseId,
    model: MODELS.lightbox,
    system: lightboxBlindPrompt(),
    content: buildBlindContent(input),
    schema: BlindRead,
  };
}

export async function blindRead(
  caseId: string, input: BlindInput, label: "blind_A" | "blind_B", check?: BlindCheck
): Promise<{ data: BlindRead; meta: CallMeta }> {
  return callModel(blindCall(caseId, input, label, check));
}

/** Both blind reads, in parallel, from the same input. */
export async function blindReadTwice(caseId: string, input: BlindInput, check?: BlindCheck) {
  const [a, b] = await Promise.all([blindRead(caseId, input, "blind_A", check), blindRead(caseId, input, "blind_B", check)]);
  return { a, b };
}
