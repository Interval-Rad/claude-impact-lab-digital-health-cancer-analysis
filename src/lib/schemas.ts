// zod schemas mirroring the JSON shapes in agents/*.md.
import { z } from "zod";

// ---------- shared enums (agents/02_LIGHTBOX_read.md) ----------
export const View = z.enum(["PA", "AP", "unknown"]);
export const Comparable = z.enum(["yes", "limited", "no"]);
export const Region = z.enum([
  "R_apical", "R_upper", "R_mid", "R_lower", "L_apical", "L_upper", "L_mid", "L_lower",
  "R_hilum", "L_hilum", "mediastinum", "heart", "R_pleura", "L_pleura", "diaphragm_below",
  "bones", "soft_tissue", "devices",
]);
export const Kind = z.enum([
  "nodule_or_mass", "consolidation", "collapse", "effusion", "pneumothorax", "interstitial",
  "adenopathy", "cardiac_silhouette", "bone_lesion", "device", "other",
]);
export const Status = z.enum(["new", "increased", "decreased", "stable", "resolved", "indeterminate"]);
export const SizeChangeWords = z.enum(["larger", "smaller", "similar", "not_comparable", "not_applicable"]);
export const Agreement = z.enum(["2_of_2", "status_differs", "1_of_2"]);

// ---------- Lightbox blind read ----------
export const ImageQuality = z.object({
  view: View,
  view_inferred: z.boolean(),
  rotation: z.enum(["none", "mild", "marked"]),
  inspiration: z.enum(["adequate", "low"]),
  exposure: z.enum(["adequate", "over", "under"]),
  coverage: z.enum(["complete", "incomplete"]),
  artifacts: z.array(z.string()),
});

export const Difference = z.object({
  factor: z.enum([
    "projection", "position", "rotation", "inspiration", "exposure", "coverage", "contrast_phase", "slice_level",
  ]),
  detail: z.string(),
  prevents: z.string(),
});

export const Comparability = z.object({
  prior: ImageQuality,
  current: ImageQuality,
  comparable: Comparable,
  differences: z.array(Difference),
});

export const SystematicRead = z.object({
  airway_lungs: z.string(),
  mediastinum_hila: z.string(),
  pleura: z.string(),
  heart: z.string(),
  diaphragm_below: z.string(),
  bones_soft_tissue: z.string(),
  devices: z.string(),
});

export const BlindFinding = z.object({
  region: Region,
  kind: Kind,
  description: z.string(),
  status: Status,
  size_change_words: SizeChangeWords,
  needs_measurement: z.boolean(),
  evidence: z.string(),
  time_sensitive: z.boolean(),
});

export const BlindCantDetermine = z.object({
  question: z.string(),
  reason: z.string(),
  recommend: z.string(),
  region: z.string(),
  kind: z.string(),
});

export const BlindRead = z.object({
  comparability: Comparability,
  systematic_read: SystematicRead,
  findings: z.array(BlindFinding),
  cant_determine: z.array(BlindCantDetermine),
  limits: z.string(),
});

// ---------- Lightbox focused pass ----------
export const FocusedPass = z.object({
  indication_pass: z.object({
    question: z.string(),
    answer: z.string(),
    regions_rechecked: z.array(z.string()),
  }),
  added_findings: z.array(BlindFinding.extend({ added_in_focused_pass: z.literal(true) })),
  prior_report_discrepancies: z.array(z.object({ prior_report_says: z.string(), images_show: z.string() })),
  outside_indication: z.array(z.object({ finding_id: z.string(), outside_indication: z.boolean() })),
  look_first: z.array(z.string()),
});

// ---------- what Charge receives from Lightbox ----------
export const MergedFinding = BlindFinding.extend({
  id: z.string(),
  size_change_words: SizeChangeWords.nullable(), // null: the two reads used different words
  reads: z.object({ a: BlindFinding.nullable(), b: BlindFinding.nullable() }), // both reads, shown on expand
  agreement: Agreement.nullable(), // null: added in the focused pass, so not part of the two blind reads
  read_a_status: Status.nullable(),
  read_b_status: Status.nullable(),
  added_in_focused_pass: z.boolean(),
  outside_indication: z.boolean().nullable(), // null until the focused pass has run
});

export const MergedCantDetermine = z.object({
  question: z.string(),
  reason: z.string(),
  recommend: z.string(),
  related_finding: z.string().nullable(),
  from_reads: z.array(z.enum(["A", "B"])),
});

export const StudyFlag = z.enum(["reads_disagree_on_comparability"]);

export const LightboxMerged = z.object({
  comparability: Comparability,
  comparable_by_read: z.object({ a: Comparable, b: Comparable }),
  systematic_read: SystematicRead,
  findings: z.array(MergedFinding),
  cant_determine: z.array(MergedCantDetermine),
  indication_pass: FocusedPass.shape.indication_pass.nullable(),
  prior_report_discrepancies: FocusedPass.shape.prior_report_discrepancies,
  look_first: z.array(z.string()),
  study_flags: z.array(StudyFlag),
  limits: z.string(),
});

// ---------- Stat (agents/03_STAT_triage.md) ----------
export const SeveritySubgroup = z.enum([
  "new_lesion_or_possible_new_diagnosis", "urgent_incidental", "progression_of_known_disease",
  "indeterminate_needs_human", "stable_or_responding",
]);
export const UrgencyTier = z.enum(["critical", "high", "routine"]);

export const StatOutput = z.object({
  severity_subgroup: SeveritySubgroup,
  urgency_tier: UrgencyTier,
  page_on_call: z.boolean(),
  context_flags: z.array(z.object({ item: z.string(), bears_on: z.string(), why: z.string() })),
  worklist_reason: z.string(),
});

// ---------- Charge QC call (agents/01_CHARGE_orchestrator.md) ----------
export const QcOutput = z.object({
  pass: z.boolean(),
  mismatches: z.array(
    z.object({
      type: z.enum([
        "missing_finding", "unsupported_statement", "laterality", "number_not_from_confirmed_measurement",
        "abstention_dropped", "disagreement_hidden", "diagnosis_as_fact",
      ]),
      finding_id: z.string().nullable(),
      report_text: z.string(),
      why: z.string(),
    })
  ),
});

// ---------- Courier (agents/04_COURIER_report_handoff.md) ----------
export const CourierReport = z.object({ report: z.string() });

// Mode B, limited to the five keys in scope for this build.
export const CourierHandoff = z.object({
  provider_message: z.object({ subject: z.string(), body: z.string() }),
  followup_order: z
    .object({
      study: z.string(), body_part: z.string(), contrast: z.string(), interval: z.string(), reason: z.string(),
    })
    .nullable(),
  tumor_board: z.object({
    recist_rows: z.array(z.object({ lesion: z.string(), prior: z.string(), current: z.string(), change: z.string() })),
    history: z.string(),
    impression: z.string(),
  }),
  surgeon: z.string(),
  family_page: z.string(),
});

// ---------- case.json on disk (dataset/pull_demo_pairs.py) ----------
const CaseImage = z.object({
  file: z.string(),
  media_type: z.string(), // recorded at download. The app still sniffs the bytes before every call
  nih: z.object({
    image_id: z.string(),
    label_names: z.array(z.string()), // text-mined, noisy. Never sent to a model
    patient_id: z.union([z.number(), z.string()]),
    follow_up: z.number().nullable().optional(),
    patient_age: z.number().nullable().optional(),
    patient_sex: z.string().nullable().optional(),
    view_position: z.string(),
    original_width: z.number().nullable().optional(),
    original_height: z.number().nullable().optional(),
  }),
});

export const SyntheticChart = z.object({
  mrn: z.string().default(""),
  display_name: z.string().default(""),
  prior_date: z.string().default(""),
  current_date: z.string().default(""),
  indication: z.string().default(""),
  ordering_provider: z.object({ name: z.string().default(""), role: z.string().default("") }),
  prior_report: z.string().default(""),
  vitals: z.object({
    hr: z.number().nullable(), spo2: z.number().nullable(), temp_c: z.number().nullable(), bp: z.string(),
  }),
  labs: z.array(z.object({ name: z.string(), value: z.string(), flag: z.string().nullable(), date: z.string() })),
  problem_list: z.array(z.string()),
  pcp_on_file: z.boolean(),
  insurance_on_file: z.boolean(),
  preferred_language: z.string(),
});

export const CaseFile = z.object({
  case_id: z.string(),
  source: z.string(),
  why_picked: z.string().optional(),
  prior: CaseImage,
  current: CaseImage,
  synthetic_chart: SyntheticChart,
  ground_truth: z.unknown().optional(),
});

export type View = z.infer<typeof View>;
export type Comparable = z.infer<typeof Comparable>;
export type Status = z.infer<typeof Status>;
export type Agreement = z.infer<typeof Agreement>;
export type BlindFinding = z.infer<typeof BlindFinding>;
export type BlindRead = z.infer<typeof BlindRead>;
export type FocusedPass = z.infer<typeof FocusedPass>;
export type MergedFinding = z.infer<typeof MergedFinding>;
export type MergedCantDetermine = z.infer<typeof MergedCantDetermine>;
export type LightboxMerged = z.infer<typeof LightboxMerged>;
export type StatOutput = z.infer<typeof StatOutput>;
export type QcOutput = z.infer<typeof QcOutput>;
export type CourierHandoff = z.infer<typeof CourierHandoff>;
export type CaseFile = z.infer<typeof CaseFile>;
export type SyntheticChart = z.infer<typeof SyntheticChart>;
