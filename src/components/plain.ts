// Plain-language labels for the simple screens. Display only: nothing here changes the data.
import type { MergedFinding } from "@/lib/schemas";

const REGION: Record<string, string> = {
  R_apical: "Right lung, top", R_upper: "Right upper lung", R_mid: "Right mid lung", R_lower: "Right lower lung",
  L_apical: "Left lung, top", L_upper: "Left upper lung", L_mid: "Left mid lung", L_lower: "Left lower lung",
  R_hilum: "Right hilum", L_hilum: "Left hilum", mediastinum: "Mediastinum", heart: "Heart",
  R_pleura: "Right pleura", L_pleura: "Left pleura", diaphragm_below: "Diaphragm and below", bones: "Bones",
  soft_tissue: "Soft tissue", devices: "Lines and devices",
};
const KIND: Record<string, string> = {
  nodule_or_mass: "nodule or mass", consolidation: "opacity", collapse: "collapse", effusion: "fluid (effusion)",
  pneumothorax: "pneumothorax", interstitial: "interstitial markings", adenopathy: "enlarged nodes",
  cardiac_silhouette: "size and shape", bone_lesion: "bone lesion", device: "device", other: "other finding",
};
// A word plus a shape, never colour alone.
const CHANGE: Record<string, string> = {
  new: "▲ New", increased: "▲ Increased", decreased: "▼ Decreased", stable: "■ No change", resolved: "○ Resolved",
  indeterminate: "◇ Can't tell",
};

export const findingName = (f: MergedFinding) => `${REGION[f.region] ?? f.region}: ${KIND[f.kind] ?? f.kind}`;
export const changeWord = (status: string) => CHANGE[status] ?? status;

export function agreementWord(f: MergedFinding): { text: string; warn: boolean } {
  if (f.added_in_focused_pass) return { text: "Added on the second look", warn: false };
  if (f.agreement === "2_of_2") return { text: "Both reads agree", warn: false };
  if (f.agreement === "1_of_2") return { text: "Only 1 of 2 reads saw this !", warn: true };
  return { text: "The 2 reads disagree !", warn: true };
}

const STATE: Record<string, string> = {
  BLIND_READING: "AI is reading", RECONCILED: "AI is reading", FOCUSED: "AI is reading", TRIAGED: "AI is writing the draft",
  DRAFTED: "Ready for review", RESIDENT_REVIEWED: "Waiting for attending", ATTENDING_SIGNED: "Signed",
  DELIVERED: "Sent to provider", ACKNOWLEDGED: "Opened by provider", PATIENT_INFORMED: "Patient informed",
  NEEDS_HUMAN: "Needs a person (no AI draft)",
};
export const stateWord = (state: string) => STATE[state] ?? (state.startsWith("RECEIVED") ? "Not read yet" : state);

const COMPARABLE: Record<string, string> = {
  yes: "● Yes, the two films can be compared", limited: "◐ Only partly: read the changes with care",
  no: "✕ No, the two films cannot be compared",
};
export const comparableWord = (c: string) => COMPARABLE[c] ?? c;

const TIER: Record<string, string> = { critical: "▲ Urgent", high: "◆ Review soon", routine: "○ Routine" };
export const tierWord = (t: string | null) => (t ? TIER[t] ?? t : "Not triaged yet");
