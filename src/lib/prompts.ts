// Loads agents/*.md at call time and extracts the fenced system prompt, so a
// clinician can edit a prompt without touching code or restarting the server.
import fs from "node:fs";
import path from "node:path";

const AGENTS_DIR = path.join(process.cwd(), "agents");
const READING_METHOD_SLOT = "{{contents of READING_METHOD.md}}";

function readAgentFile(name: string): string {
  return fs.readFileSync(path.join(AGENTS_DIR, name), "utf8");
}

/** Returns the body of the first fenced block after the heading that starts with `heading`. */
export function extractFencedBlock(markdown: string, heading: string, file = "markdown"): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, "").trim().startsWith(heading));
  if (start === -1) throw new Error(`${file}: heading "${heading}" not found`);
  let open = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break; // next heading: no fence under ours
    if (lines[i].startsWith("```")) { open = i; break; }
  }
  if (open === -1) throw new Error(`${file}: no fenced block under "${heading}"`);
  const close = lines.findIndex((l, i) => i > open && l.startsWith("```"));
  if (close === -1) throw new Error(`${file}: unclosed fenced block under "${heading}"`);
  return lines.slice(open + 1, close).join("\n").trim();
}

function load(file: string, heading: string): string {
  return extractFencedBlock(readAgentFile(file), heading, file);
}

export function readingMethod(): string {
  return readAgentFile("READING_METHOD.md").trim();
}

export function lightboxBlindPrompt(): string {
  const prompt = load("02_LIGHTBOX_read.md", "System prompt, blind read");
  if (!prompt.includes(READING_METHOD_SLOT)) {
    throw new Error(`02_LIGHTBOX_read.md: blind read prompt is missing ${READING_METHOD_SLOT}`);
  }
  return prompt.replace(READING_METHOD_SLOT, () => readingMethod());
}

export const lightboxFocusedPrompt = () => load("02_LIGHTBOX_read.md", "System prompt, focused pass");
export const chargeQcPrompt = () => load("01_CHARGE_orchestrator.md", "System prompt for the QC call");
export const statPrompt = () => load("03_STAT_triage.md", "System prompt");
export const courierReportPrompt = () => load("04_COURIER_report_handoff.md", "System prompt, mode A");
export const courierHandoffPrompt = () => load("04_COURIER_report_handoff.md", "System prompt, mode B");
