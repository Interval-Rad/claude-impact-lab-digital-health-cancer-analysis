// Shapes the screens render. Type-only: safe to import from client components.
// Mirrors "What Charge sends the UI" in agents/01_CHARGE_orchestrator.md plus the
// header and chart fields shown in fixtures/demo_case.json.
import type { CourierHandoff, LightboxMerged, StatOutput, QcOutput } from "@/lib/schemas";

export type ReviewAction = "accepted" | "edited" | "rejected";

export type Review = {
  action: ReviewAction;
  reason?: string; // required for edited and rejected
  text?: string; // the radiologist's wording, for edited
};

export type MeasurementEntry = {
  finding_id: string;
  prior_mm: number | null; // typed by the radiologist. Never model output
  current_mm: number | null;
};

export type StudySide = { view: string; date: string | null };

export type SignatureRecord = {
  resident?: { at: string; by?: string } | null;
  attending?: { at: string; by?: string } | null;
} | null;

export type CasePayload = {
  _mock?: boolean;
  case_id: string;
  state: string;
  version?: number;
  banner: string;
  header: {
    display_name: string | null;
    mrn: string | null;
    exam: string | null;
    prior: StudySide;
    current: StudySide;
    arrived_at: string | null;
  };
  images: { prior: string; current: string };
  indication: string | null;
  ordering_provider: { name: string; role: string } | null;
  prior_report: string | null;
  indication_released_at: string | null;
  lightbox: LightboxMerged | null; // null: not run yet
  stat: StatOutput | null;
  measurements: MeasurementEntry[];
  recist: { category: string; line: string } | null;
  reviews: Record<string, Review>;
  report_draft: string | null;
  qc: QcOutput | null;
  signature: SignatureRecord;
  delivery?: DeliveryInfo | null;
  handoff?: CourierHandoff | null; // null until the attending has signed and Courier has run
  patient_informed?: boolean;
  status_text?: string | null; // plain text status from the server, e.g. "Blind read A running"
  busy?: string | null; // a background step is running: the screen polls until it clears
  error?: string | null; // a failure, shown as it happened
  code_checks?: { check: string; pass: boolean; detail: string }[];
  paged_on_call_at?: string | null;
  can_reset?: boolean; // a recorded baseline exists: the demo can return to the unreviewed AI draft
  replay?: boolean; // DEMO_MODE=replay: responses come from data/cache
  synthetic_fields: string[];
  calls?: { label: string; model: string; replayed: boolean; recorded_at: string }[];
};

export type DeliveryInfo = {
  sent_at: string;
  tier: StatOutput["urgency_tier"];
  how: string;
  deadline_at: string | null; // demo clock: 60 minutes runs as 20 seconds
  opened_at: string | null;
  escalations: { at: string; action: string }[];
  order_signed_at: string | null;
};

// One message in the ordering provider's inbox. Exists only for attending-signed, delivered results.
export type InboxItem = {
  case_id: string;
  patient: string | null;
  mrn: string | null;
  subject: string;
  tier: StatOutput["urgency_tier"];
  sent_at: string;
  opened_at: string | null;
  deadline_at: string | null;
  escalated: boolean;
};

// One worklist row. Every field is its own visible column. There is no combined ranking value.
export type WorklistRow = {
  case_id: string;
  mock: boolean;
  tier: StatOutput["urgency_tier"] | null;
  severity_subgroup: StatOutput["severity_subgroup"] | null;
  agreement_flag: "reads_agree" | "one_of_two" | "reads_disagree" | null;
  patient: string | null;
  mrn: string | null;
  exam: string | null;
  views: { prior: string; current: string };
  indication: string | null;
  indication_released_at: string | null;
  context_flags: string[];
  page_on_call: boolean;
  state: string;
  arrived_at: string | null;
  has_draft: boolean;
  summary: string | null; // Stat's one-line reason for the row
};
