import type { BlindReadT, Merged, StatT, QcT, HandoffT, VoiceScriptsT } from "./schemas";
import type { Measurement, RecistResult } from "./recist";

export type Role = "medical oncology" | "PCP" | "ED";
export type CaseFile = {
  case_id: string; source: string; category_hint: string;
  nih: {
    patient_id: string; sex: string;
    prior: { image: string; view: string; age: string; nlp_labels: string; px_mm_at_1024: string };
    current: { image: string; view: string; age: string; nlp_labels: string; px_mm_at_1024: string };
  };
  synthetic_chart: {
    mrn: string; display_name: string; prior_date: string; current_date: string; indication: string;
    ordering_provider: { name: string; role: string }; prior_report: string;
    vitals: { hr: number | null; spo2: number | null; temp_c: number | null; bp: string };
    labs: { name: string; value: string; flag: "H" | "L" | null; date: string }[];
    problem_list: string[]; pcp_on_file: boolean; insurance_on_file: boolean; preferred_language: string;
  };
  ground_truth?: unknown;
};

export type State =
  | "RECEIVED" | "BLIND_READING" | "RECONCILED" | "FOCUSED" | "TRIAGED" | "DRAFTED"
  | "RESIDENT_REVIEWED" | "ATTENDING_SIGNED" | "DELIVERED" | "ACKNOWLEDGED" | "PATIENT_INFORMED" | "NEEDS_HUMAN";

export type Review = { action: "accept" | "edit" | "reject"; reason: string | null; edited_description: string | null; by: string; ts: string };

export type Delivery = HandoffT & {
  sent_at: string; tier: "critical" | "high" | "routine"; due_at: string | null;
  actions: { ts: string; action: string; detail: string }[]; escalated: boolean;
};

export type CaseState = {
  case_id: string; state: State; version: number; progress: string; created_at: string;
  mode: "live" | "fixture"; models: { lightbox: string; sonnet: string; fell_back: boolean };
  indication_released_at: string | null;
  blind: { a: BlindReadT | null; b: BlindReadT | null };
  lightbox: Merged | null; stat: StatT | null;
  paged: { at: string } | null;
  reviews: Record<string, Review>;
  measurements: Measurement[]; recist: RecistResult | null;
  report_draft: string; report_edited: boolean; drafting: boolean;
  qc: QcT & { mode: "model+code" | "code_only" };
  resident_signed: { by: string; ts: string; version: number } | null;
  signature: { who: string; ts: string; version: number } | null;
  signed_report: string | null;
  delivery: Delivery | null;
  acknowledged_at: string | null; order_signed_at: string | null; patient_informed_at: string | null;
  voice: VoiceScriptsT | null;
  needs_human_reason: string | null;
};

export const BANNER = "AI DRAFT. Requires resident review and attending signature.";
