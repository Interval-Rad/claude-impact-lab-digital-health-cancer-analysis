// Courier: the report and handoff agent. Text only.
// Mode A drafts the report before signature. Mode B runs only after the attending signs.
import { MODELS } from "./config";
import { callModel, type CallMeta } from "./model";
import { courierHandoffPrompt, courierReportPrompt } from "./prompts";
import { CourierHandoff, CourierReport, type QcOutput, type StatOutput, type SyntheticChart } from "./schemas";

export const LAST_LINE = "AI DRAFT: requires resident review and attending signature.";
export const NAVIGATOR_LINE = "No PCP on file. Follow-up routed to the nurse navigator queue.";

export interface ReportInput {
  HEADER: {
    exam: string; clinical_indication: string; ordering_provider: string; comparison: string; technique: string;
  };
  /** Computed in code from look_first, in order, so the report and the QC call read the same list. */
  LOOK_AT_FIRST: { finding_id: string; region: string; kind: string; time_sensitive: boolean }[];
  FINDINGS: unknown; // merged Lightbox output after any resident decisions
  MEASUREMENTS: { finding_id: string; prior_mm: number; current_mm: number }[]; // radiologist-entered only
  RECIST: string; // the line code computed
  TRIAGE: StatOutput;
}

/** Mode A. `mismatches` is set on the one redraft after a failed QC call. */
export async function draftReport(
  caseId: string, label: string, input: ReportInput, mismatches?: QcOutput["mismatches"]
): Promise<{ data: { report: string }; meta: CallMeta }> {
  const content = [{ type: "text" as const, text: JSON.stringify(input) }];
  if (mismatches?.length) {
    content.push({
      type: "text" as const,
      text: `A quality check found these mismatches between FINDINGS and your previous draft. Fix each one:\n${JSON.stringify(mismatches)}`,
    });
  }
  return callModel({
    agent: "courier", label, caseId, model: MODELS.courier, system: courierReportPrompt(), content, schema: CourierReport,
    check: (d) => (d.report.trimEnd().endsWith(LAST_LINE) ? [] : [`The report must end with the line: ${LAST_LINE}`]),
  });
}

export interface HandoffInput {
  signed: boolean;
  signer: string | null;
  signed_at: string | null;
  findings_version: number;
  signed_report: string;
  triage: StatOutput;
  patient_context: Pick<SyntheticChart, "pcp_on_file" | "insurance_on_file" | "preferred_language"> & { ordering_role: string };
}

/** Mode B. Refuses to run on an unsigned report. Charge checks the same thing: two locks. */
export async function handoff(caseId: string, input: HandoffInput): Promise<{ data: CourierHandoff; meta: CallMeta }> {
  if (input.signed !== true || !input.signer || !input.signed_at) {
    throw new Error("NOT_SIGNED: Courier handoff mode refuses to run before the attending signs.");
  }
  const system =
    courierHandoffPrompt() +
    "\n\nFor this build, return only these keys: provider_message, followup_order, tumor_board, surgeon, family_page.";
  const result = await callModel({
    agent: "courier", label: `handoff_v${input.findings_version}`, caseId, model: MODELS.courier, system,
    content: [{ type: "text", text: JSON.stringify(input) }], schema: CourierHandoff,
    // The same signed findings replay whatever the clock said when they were signed.
    cacheKey: JSON.stringify({ ...input, signed_at: "*", signed_report: input.signed_report.replace(/\nSigned by [^\n]*$/, "") }),
  });
  // Safety net, in code: these flags add support and never enter the worklist sort.
  if (!input.patient_context.pcp_on_file && result.data.followup_order) {
    result.data.provider_message.body = `${result.data.provider_message.body.trimEnd()}\n${NAVIGATOR_LINE}`;
  }
  return result;
}
