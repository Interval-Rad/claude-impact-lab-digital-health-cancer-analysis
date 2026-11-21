// The one place model ids and demo switches live.
// `npm run models` (and server start) checks every id below against the API key.

export const MODELS = {
  lightbox: "claude-fable-5-2", // vision: two blind reads and the focused pass
  lightboxFallback: "claude-opus-5-5", // only if Fable is unavailable. The UI footer must say so
  stat: "claude-sonnet-5-5",
  courier: "claude-sonnet-5-5",
  qc: "claude-sonnet-5-5",
} as const;

export const REQUIRED_MODELS: string[] = [...new Set(Object.values(MODELS))];

export const MAX_TOKENS = 16000;

// agents/01_CHARGE_orchestrator.md: until a clinician confirms the RECIST wording for
// radiographs, X-ray pairs show "RECIST 1.1: not computed on radiographs".
// Set to "estimate" once confirmed; results are then labelled as an estimate from radiograph.
export const RECIST_RADIOGRAPH_POLICY: "not_computed" | "estimate" = "not_computed";

export const BANNER = "AI DRAFT. Requires resident review and attending signature.";

export function isReplay(): boolean {
  return process.env.DEMO_MODE === "replay";
}
