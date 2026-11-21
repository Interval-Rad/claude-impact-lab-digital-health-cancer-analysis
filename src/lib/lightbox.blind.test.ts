// Hard rule 1: the blind reads see images and view labels only.
// This test fails if a blind-read request contains the indication, the prior
// report, any chart field, a study date, or the NIH text-mined labels.
import { describe, expect, it } from "vitest";
import { blindCall } from "./lightbox.blind";
import { blindInputFromCase } from "./lightbox";
import { CaseFile } from "./schemas";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);

// Every held-back value is a unique sentinel, so any leak is detectable.
const SENTINELS = {
  mrn: "SENTINEL_MRN_48213", display_name: "SENTINEL_NAME_Rivera", prior_date: "1999-01-02", current_date: "1999-03-04",
  indication: "SENTINEL_INDICATION known lung adenocarcinoma restaging", provider: "SENTINEL_PROVIDER_Okafor",
  role: "SENTINEL_ROLE_oncology", prior_report: "SENTINEL_PRIOR_REPORT nodule right upper zone", bp: "SENTINEL_BP_91/52",
  lab_name: "SENTINEL_LAB_CEA", lab_value: "SENTINEL_LABVALUE_41.7", problem: "SENTINEL_PROBLEM_stage_IV",
  language: "SENTINEL_LANG_es", nih_label_prior: "SENTINEL_NIHLABEL_Nodule", nih_label_current: "SENTINEL_NIHLABEL_Mass",
  why: "SENTINEL_WHY_PICKED", truth: "SENTINEL_GROUND_TRUTH",
};
const VITALS = { hr: 13117, spo2: 8823, temp_c: 39.4127 }; // numbers no base64 or prompt would contain by chance

const image = (file: string, view: string, label: string) => ({
  file, media_type: "image/png", // deliberately wrong for the JPEG: the bytes must win
  nih: { image_id: "00000000_000", label_names: [label], patient_id: 987654321, follow_up: 1, patient_age: 71,
    patient_sex: "F", view_position: view, original_width: 2048, original_height: 2500 },
});

const caseFile = CaseFile.parse({
  case_id: "firewall_test", source: "test", why_picked: SENTINELS.why,
  prior: image("prior.png", "PA", SENTINELS.nih_label_prior),
  current: image("current.png", "AP", SENTINELS.nih_label_current),
  synthetic_chart: {
    mrn: SENTINELS.mrn, display_name: SENTINELS.display_name, prior_date: SENTINELS.prior_date,
    current_date: SENTINELS.current_date, indication: SENTINELS.indication,
    ordering_provider: { name: SENTINELS.provider, role: SENTINELS.role }, prior_report: SENTINELS.prior_report,
    vitals: { ...VITALS, bp: SENTINELS.bp },
    labs: [{ name: SENTINELS.lab_name, value: SENTINELS.lab_value, flag: "H", date: "1999-03-03" }],
    problem_list: [SENTINELS.problem], pcp_on_file: false, insurance_on_file: false, preferred_language: SENTINELS.language,
  },
  ground_truth: { note: SENTINELS.truth },
});

describe("indication firewall: blind read requests", () => {
  const input = blindInputFromCase(caseFile, JPEG, PNG);
  const requests = (["blind_A", "blind_B"] as const).map((label) => blindCall("firewall_test", input, label));

  it("contain no held-back value anywhere in the request", () => {
    for (const request of requests) {
      const wire = JSON.stringify({ system: request.system, content: request.content, model: request.model });
      for (const [field, value] of Object.entries(SENTINELS)) {
        expect(wire.includes(value), `blind request leaks ${field}`).toBe(false);
      }
      for (const [field, value] of Object.entries(VITALS)) {
        expect(wire.includes(String(value)), `blind request leaks vitals.${field}`).toBe(false);
      }
      expect(wire.includes("987654321"), "blind request leaks the patient id").toBe(false);
    }
  });

  it("carry exactly PRIOR, image, CURRENT, image and the view labels", () => {
    for (const request of requests) {
      expect(request.content.map((b) => b.type)).toEqual(["text", "image", "text", "image", "text"]);
      const text = request.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text);
      expect(text[0]).toBe("PRIOR");
      expect(text[1]).toBe("CURRENT");
      expect(JSON.parse(text[2])).toEqual({
        modality: "XR", prior: { view_label: "PA" }, current: { view_label: "AP" }, corrections: [],
      });
    }
  });

  it("give both reads the identical request", () => {
    expect(JSON.stringify(requests[0].content)).toBe(JSON.stringify(requests[1].content));
    expect(requests[0].system).toBe(requests[1].system);
  });

  it("set the media type from the bytes, not from the file name or case.json", () => {
    const images = requests[0].content.filter((b) => b.type === "image") as { source: { media_type: string } }[];
    expect(images.map((i) => i.source.media_type)).toEqual(["image/jpeg", "image/png"]);
  });
});
