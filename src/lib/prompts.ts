import fs from "fs";
import path from "path";

// Prompts live in the markdown files so clinicians can edit them without touching code.
const AGENTS_DIR = path.join(process.cwd(), "Interval_Read_Kit", "agents");

function read(file: string) {
  return fs.readFileSync(path.join(AGENTS_DIR, file), "utf8");
}

/** First fenced block after the heading matching `heading`. */
function fenced(file: string, heading: string): string {
  const text = read(file);
  const at = text.indexOf(heading);
  if (at < 0) throw new Error(`Heading not found in ${file}: ${heading}`);
  const open = text.indexOf("```", at);
  const start = text.indexOf("\n", open) + 1;
  const end = text.indexOf("\n```", start);
  if (open < 0 || end < 0) throw new Error(`No fenced block after ${heading} in ${file}`);
  return text.slice(start, end).trim();
}

export function readingMethod() { return read("READING_METHOD.md"); }

export const prompts = {
  blind: () => fenced("02_LIGHTBOX_read.md", "### System prompt, blind read").replace("{{contents of READING_METHOD.md}}", readingMethod()),
  focused: () => fenced("02_LIGHTBOX_read.md", "### System prompt, focused pass"),
  stat: () => fenced("03_STAT_triage.md", "## System prompt"),
  courierA: () => fenced("04_COURIER_report_handoff.md", "### System prompt, mode A"),
  courierB: () => fenced("04_COURIER_report_handoff.md", "### System prompt, mode B"),
  courierC: () => fenced("04_COURIER_report_handoff.md", "### System prompt, mode C"),
  qc: () => fenced("01_CHARGE_orchestrator.md", "## System prompt for the QC call"),
};
