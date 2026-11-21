import { z } from "zod";

export const REGIONS = ["R_apical","R_upper","R_mid","R_lower","L_apical","L_upper","L_mid","L_lower","R_hilum","L_hilum","mediastinum","heart","R_pleura","L_pleura","diaphragm_below","bones","soft_tissue","devices"] as const;
export const KINDS = ["nodule_or_mass","consolidation","collapse","effusion","pneumothorax","interstitial","adenopathy","cardiac_silhouette","bone_lesion","device","other"] as const;
export const STATUSES = ["new","increased","decreased","stable","resolved","indeterminate"] as const;
export const SIZE_WORDS = ["larger","smaller","similar","not_comparable","not_applicable"] as const;

const View = z.enum(["PA","AP","unknown"]);
const Side = z.object({
  view: View, view_inferred: z.boolean(),
  rotation: z.enum(["none","mild","marked"]), inspiration: z.enum(["adequate","low"]),
  exposure: z.enum(["adequate","over","under"]), coverage: z.enum(["complete","incomplete"]),
  artifacts: z.array(z.string()),
});
export const Comparable = z.enum(["yes","limited","no"]);

export const BlindFinding = z.object({
  region: z.enum(REGIONS), kind: z.enum(KINDS), description: z.string(),
  status: z.enum(STATUSES), size_change_words: z.enum(SIZE_WORDS),
  needs_measurement: z.boolean(), evidence: z.string(), time_sensitive: z.boolean(),
});
export const CantDetermine = z.object({
  question: z.string(), reason: z.string(), recommend: z.string(),
  region: z.string().optional(), kind: z.string().optional(),
});
export const BlindRead = z.object({
  comparability: z.object({
    prior: Side, current: Side, comparable: Comparable,
    differences: z.array(z.object({ factor: z.string(), detail: z.string(), prevents: z.string() })),
  }),
  systematic_read: z.object({
    airway_lungs: z.string(), mediastinum_hila: z.string(), pleura: z.string(), heart: z.string(),
    diaphragm_below: z.string(), bones_soft_tissue: z.string(), devices: z.string(),
  }),
  findings: z.array(BlindFinding),
  cant_determine: z.array(CantDetermine),
  limits: z.string(),
});
export type BlindReadT = z.infer<typeof BlindRead>;
export type BlindFindingT = z.infer<typeof BlindFinding>;

export const Focused = z.object({
  indication_pass: z.object({ question: z.string(), answer: z.string(), regions_rechecked: z.array(z.string()) }),
  added_findings: z.array(BlindFinding.extend({ added_in_focused_pass: z.literal(true).optional() })),
  prior_report_discrepancies: z.array(z.object({ prior_report_says: z.string(), images_show: z.string() })),
  outside_indication: z.record(z.string(), z.boolean()),
  look_first: z.array(z.string()),
});
export type FocusedT = z.infer<typeof Focused>;

export const Stat = z.object({
  severity_subgroup: z.enum(["new_lesion_or_possible_new_diagnosis","urgent_incidental","progression_of_known_disease","indeterminate_needs_human","stable_or_responding"]),
  urgency_tier: z.enum(["critical","high","routine"]),
  page_on_call: z.boolean(),
  context_flags: z.array(z.object({ item: z.string(), bears_on: z.string(), why: z.string() })),
  worklist_reason: z.string(),
});
export type StatT = z.infer<typeof Stat>;

export const Qc = z.object({
  pass: z.boolean(),
  mismatches: z.array(z.object({
    type: z.string(), finding_id: z.string().nullable(), report_text: z.string(), why: z.string(),
  })),
});
export type QcT = z.infer<typeof Qc>;

export const ReportDraft = z.object({ report: z.string() });

const nullableStr = z.string().nullable();
export const Handoff = z.object({
  provider_message: z.object({ subject: z.string(), body: z.string() }),
  followup_order: z.object({ study: z.string(), body_part: z.string(), contrast: z.string(), interval: z.string(), reason: z.string() }).nullable(),
  epic_chat_draft: z.string(),
  tumor_board: z.string(), surgeon: z.string(), oncology_note_draft: z.string(),
  pcp_summary: z.string(), family_page: z.string(),
  navigator_referral: z.object({
    reason: z.array(z.string()),
    follow_up: z.object({ study: z.string(), due_by: z.string() }),
    owner: z.string(),
    patient_letter: z.object({ language: z.string(), reading_level: z.string(), text: z.string() }),
    low_cost_options_needed: z.boolean(),
  }).nullable(),
  fhir_diagnostic_report: z.record(z.string(), z.unknown()),
});
export type HandoffT = z.infer<typeof Handoff>;
export const VoiceScripts = z.object({ scheduling_call: z.string(), family_page_read: z.string() });
export type VoiceScriptsT = z.infer<typeof VoiceScripts>;

export type MergedFinding = BlindFindingT & {
  id: string; agreement: "2_of_2" | "status_differs" | "1_of_2" | "single_read";
  read_a_status: string | null; read_b_status: string | null;
  added_in_focused_pass: boolean; outside_indication: boolean;
};
export type CantDetermineMerged = { question: string; reason: string; recommend: string; related_finding: string | null };
export type Merged = {
  comparability: BlindReadT["comparability"];
  systematic_read: BlindReadT["systematic_read"];
  findings: MergedFinding[];
  cant_determine: CantDetermineMerged[];
  indication_pass: FocusedT["indication_pass"] | null;
  prior_report_discrepancies: FocusedT["prior_report_discrepancies"];
  look_first: string[];
  study_flags: string[];
  limits: string;
};
