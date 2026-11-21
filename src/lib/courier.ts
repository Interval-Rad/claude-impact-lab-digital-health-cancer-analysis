import { ReportDraft, Handoff, VoiceScripts, type HandoffT, type Merged, type MergedFinding, type StatT, type VoiceScriptsT } from "./schemas";
import { callTool, llmMode, MODELS, text } from "./llm";
import { prompts } from "./prompts";
import type { CaseFile, CaseState } from "./types";
import type { Measurement, RecistResult } from "./recist";
import { FIXTURE_NOTICE } from "./fixtures";

export const LAST_LINE = "AI DRAFT: requires resident review and attending signature.";

/** Findings as the radiologist left them: rejected removed, edits applied. */
export function effectiveFindings(s: Pick<CaseState, "lightbox" | "reviews">): MergedFinding[] {
  return (s.lightbox?.findings ?? []).filter((f) => s.reviews[f.id]?.action !== "reject")
    .map((f) => { const r = s.reviews[f.id]; return r?.action === "edit" && r.edited_description ? { ...f, description: r.edited_description } : f; });
}

export type ReportInput = {
  header: { exam: string; indication: string; ordering_provider: string; comparison: string; technique: string };
  findings: MergedFinding[]; merged: Merged; stat: StatT; measurements: Measurement[]; recist: RecistResult | null; recistLine: string;
};

export function recommendations(findings: MergedFinding[], merged: Merged): { study: string; interval: string; why: string }[] {
  const out: { study: string; interval: string; why: string }[] = [];
  for (const c of merged.cant_determine) if (/CT/i.test(c.recommend)) out.push({ study: "CT chest", interval: "next available", why: c.question });
  if (!out.length && findings.some((f) => f.status === "new" && f.kind === "nodule_or_mass"))
    out.push({ study: "CT chest", interval: "3 months", why: "new nodule or mass on radiograph (draft recommendation for the radiologist to confirm)" });
  return out;
}

const label = (f: MergedFinding) => `${f.region.replace(/_/g, " ")} ${f.kind.replace(/_/g, " ")}`;
const words = (f: MergedFinding) => (f.size_change_words === "larger" ? "larger" : f.size_change_words === "smaller" ? "smaller" : f.size_change_words === "similar" ? "similar in size" : "size change not comparable");

/** Deterministic template fill. Fixture-mode Courier A, and a reference for the live prompt. */
export function templateReport(i: ReportInput): string {
  const { findings: fs, merged } = i;
  const sr = merged.systematic_read;
  const line = (f: MergedFinding) => `${label(f)}: ${f.status}${f.agreement === "status_differs" ? " (the two blind reads disagreed on change)" : f.agreement === "1_of_2" ? " (seen on one read of two)" : ""}, ${words(f)}. ${f.description}.`;
  const changed = fs.filter((f) => ["new", "increased", "decreased", "resolved", "indeterminate"].includes(f.status));
  const same = fs.filter((f) => f.status === "stable");
  const order = [...merged.look_first, ...fs.map((f) => f.id)].filter((id, k, a) => a.indexOf(id) === k);
  const impression = order.map((id) => fs.find((f) => f.id === id)).filter(Boolean) as MergedFinding[];
  const recs = recommendations(fs, merged);
  const urgent = fs.filter((f) => f.time_sensitive);
  return [
    `EXAM: ${i.header.exam}`, `CLINICAL INDICATION: ${i.header.indication}`, `ORDERING PROVIDER: ${i.header.ordering_provider}`,
    `COMPARISON: ${i.header.comparison}`, `TECHNIQUE: ${i.header.technique}`, "",
    "LOOK AT FIRST:", ...(urgent.length ? urgent.map((f) => `- ${label(f)}: ${f.description}`) : ["- None"]), "",
    "FINDINGS (systematic read, done blind to the indication):",
    `- Airway / lungs: ${sr.airway_lungs}`, `- Mediastinum / hila: ${sr.mediastinum_hila}`, `- Pleura: ${sr.pleura}`, `- Heart: ${sr.heart}`, `- Bones / soft tissue: ${sr.bones_soft_tissue}`, "",
    "INTERVAL CHANGE:", `- Changed: ${changed.length ? changed.map(line).join(" ") : "None called."}`, `- Unchanged: ${same.length ? same.map(line).join(" ") : "None called."}`, "",
    i.recistLine, "",
    "CAN'T DETERMINE:", ...(merged.cant_determine.length ? merged.cant_determine.map((c) => `- ${c.question} | Reason: ${c.reason} | Recommend: ${c.recommend}`) : ["- None"]), "",
    "IMPRESSION:", ...(impression.length ? impression.map((f, k) => `${k + 1}. ${line(f)}`) : ["1. No interval change called on this comparison."]), "",
    "RECOMMENDATIONS:", ...(recs.length ? recs.map((r) => `- ${r.study} ${r.interval === "next available" ? "at the next available time" : `in ${r.interval}`}.`) : ["- None"]), "",
    LAST_LINE,
  ].join("\n");
}

export async function courierA(i: ReportInput, mismatches: unknown[] = []): Promise<string> {
  if (llmMode() === "fixture") return templateReport(i);
  const input = { FINDINGS: { merged: { ...i.merged, findings: i.findings } }, MEASUREMENTS: i.measurements, RECIST: i.recistLine, TRIAGE: i.stat, header: i.header,
    ...(mismatches.length ? { QC_MISMATCHES_TO_FIX: mismatches } : {}) };
  const r = await callTool({ model: MODELS.sonnet, system: prompts.courierA(), content: [text(JSON.stringify(input))], toolName: "return_report", schema: ReportDraft, maxTokens: 4000 });
  return r.data.report.trim().endsWith(LAST_LINE) ? r.data.report.trim() : `${r.data.report.trim()}\n\n${LAST_LINE}`;
}

const addMonths = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

export function navigatorTriggers(c: CaseFile): string[] {
  const t: string[] = [], ch = c.synthetic_chart;
  if (!ch.pcp_on_file) t.push("no_pcp");
  if (ch.ordering_provider.role === "ED") t.push("ed_order");
  if (!ch.insurance_on_file) t.push("no_insurance");
  if (ch.preferred_language && ch.preferred_language !== "en") t.push("language_not_english");
  return t;
}

export type HandoffInput = { c: CaseFile; signedReport: string; signed: boolean; signer: string; signedAt: string; stat: StatT; findings: MergedFinding[]; merged: Merged; recist: RecistResult | null };

export function templateHandoff(i: HandoffInput): HandoffT {
  const { c, stat, findings: fs, merged } = i;
  const top = (merged.look_first.map((id) => fs.find((f) => f.id === id)).find(Boolean) ?? fs[0]) as MergedFinding | undefined;
  const recs = recommendations(fs, merged);
  const rec = recs[0];
  const topLine = top ? `${label(top)} ${top.status}` : "no interval change called";
  const changedLine = top ? `${label(top)}: ${top.status}, ${words(top)}.` : "No interval change called.";
  const order = rec ? { study: rec.study, body_part: "Chest", contrast: "Per provider", interval: rec.interval, reason: rec.why } : null;
  const trig = navigatorTriggers(c);
  const es = c.synthetic_chart.preferred_language === "es";
  const nav = trig.length && rec ? {
    reason: trig, follow_up: { study: rec.study, due_by: addMonths(c.synthetic_chart.current_date, 3) }, owner: "nurse navigator queue",
    patient_letter: { language: es ? "es" : "en", reading_level: "grade 6", text: es
      ? "Su equipo de salud recomienda una nueva tomografía del pecho. Esta prueba ayuda a ver mejor. Llame al número de la clínica para hacer su cita. Si no tiene seguro, pregunte por opciones de bajo costo. Hable con su médico sobre cualquier pregunta."
      : "Your care team recommends a follow-up scan of your chest. Call the clinic number to book it. If you do not have insurance, ask about low cost options. Talk to your doctor with any questions." },
    low_cost_options_needed: trig.includes("no_insurance"),
  } : null;
  const rows = i.recist && i.recist.category !== "not_computed" ? i.recist.line : "RECIST 1.1: not computed. No confirmed measurements.";
  return {
    provider_message: { subject: `${stat.urgency_tier.toUpperCase()}: ${topLine}`,
      body: `${changedLine}\n${rec ? `The radiologist recommends ${rec.study} ${rec.interval === "next available" ? "at the next available time" : `in ${rec.interval}`}.` : "The radiologist has no further imaging recommendation."}\n${order ? "A pre-filled follow-up order is waiting for your signature." : "No order is waiting for your signature."}` },
    followup_order: order,
    epic_chat_draft: `Re: ${c.synthetic_chart.mrn} chest radiograph ${c.synthetic_chart.current_date}.\nQuestion for the radiologist: `,
    tumor_board: `${rows}\nHistory: prior film ${c.synthetic_chart.prior_date}, current film ${c.synthetic_chart.current_date}. ${c.synthetic_chart.indication}\nImpression: ${changedLine}`,
    surgeon: `Location: ${top ? label(top) : "none called"}. Size trend: ${top ? words(top) : "n/a"}. The signed report says nothing on whether surgery is possible.`,
    oncology_note_draft: `DRAFT.\nChest radiograph ${c.synthetic_chart.current_date} compared with ${c.synthetic_chart.prior_date}. ${changedLine} ${rows}`,
    pcp_summary: `Found: ${changedLine}\nHow sure: ${fs.some((f) => f.agreement !== "2_of_2") ? "the two blind reads did not fully agree" : "the two blind reads agreed"}. A radiologist reviewed and signed.\nNext: ${rec ? `${rec.study} ${rec.interval}` : "no further imaging recommended"}.\nPCP: confirm the patient has been told and that the follow-up is booked.`,
    family_page: `Your care team will go over this with you.\nYou had two chest X-rays. A doctor who reads X-rays compared them. ${rec ? `Your care team recommends another scan, a CT of the chest, to look more closely.` : "No other scan is needed right now."}\nPlease call your care team at the clinic number if you have questions.`,
    navigator_referral: nav,
    fhir_diagnostic_report: { resourceType: "DiagnosticReport", status: "final", code: { text: "Chest radiograph, comparison" },
      subject: { reference: `Patient/${c.synthetic_chart.mrn}`, display: "synthetic" }, effectiveDateTime: c.synthetic_chart.current_date,
      issued: i.signedAt, performer: [{ display: i.signer }], conclusion: i.signedReport.split("IMPRESSION:")[1]?.split("RECOMMENDATIONS:")[0]?.trim() ?? "" },
  };
}

export async function courierB(i: HandoffInput): Promise<HandoffT> {
  if (i.signed !== true) throw new Error("Courier handoff refused: report is not signed."); // lock 1 of 2
  if (llmMode() === "fixture") return templateHandoff(i);
  const input = { signed_report: i.signedReport, signed: true, signer: i.signer, signed_at: i.signedAt, stat: i.stat,
    patient_context: { mrn: i.c.synthetic_chart.mrn, pcp_on_file: i.c.synthetic_chart.pcp_on_file, insurance_on_file: i.c.synthetic_chart.insurance_on_file,
      preferred_language: i.c.synthetic_chart.preferred_language, ordering_provider: i.c.synthetic_chart.ordering_provider, current_date: i.c.synthetic_chart.current_date },
    navigator_triggers: navigatorTriggers(i.c) };
  return (await callTool({ model: MODELS.sonnet, system: prompts.courierB(), content: [text(JSON.stringify(input))], toolName: "return_handoff", schema: Handoff, maxTokens: 6000 })).data;
}

export async function courierC(signedReport: string, familyPage: string, c: CaseFile): Promise<VoiceScriptsT> {
  if (llmMode() === "fixture") return {
    scheduling_call: "Your care team would like to schedule your follow-up scan. We have openings on Tuesday morning or Thursday afternoon. Which works better for you?",
    family_page_read: familyPage,
  };
  const input = { signed_report: signedReport, family_page: familyPage, language: c.synthetic_chart.preferred_language,
    task: "Write scheduling_call (opening line exactly as instructed, offer times, say nothing about results) and family_page_read (the family page, as spoken text)." };
  return (await callTool({ model: MODELS.sonnet, system: prompts.courierC(), content: [text(JSON.stringify(input))], toolName: "return_voice_scripts", schema: VoiceScripts, maxTokens: 2000 })).data;
}

export { FIXTURE_NOTICE };
