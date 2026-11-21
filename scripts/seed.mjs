// Copies pulled NIH pairs into data/cases and fills the SYNTHETIC chart. Idempotent.
// Usage: node scripts/seed.mjs [source_dir ...]   (default: data/cases is filled in place)
import fs from "fs";
import path from "path";

const DATA = path.join(process.cwd(), "data", "cases");
fs.mkdirSync(DATA, { recursive: true });
for (const src of process.argv.slice(2)) {
  for (const id of fs.readdirSync(src)) {
    const from = path.join(src, id);
    if (!fs.existsSync(path.join(from, "case.json"))) continue;
    const to = path.join(DATA, id);
    fs.mkdirSync(to, { recursive: true });
    for (const f of ["prior.png", "current.png", "case.json"]) {
      if (!fs.existsSync(path.join(to, f))) fs.copyFileSync(path.join(from, f), path.join(to, f));
    }
  }
}

const onc = { name: "Dr. A. Rivera (synthetic)", role: "medical oncology" };
const normalVitals = { hr: 78, spo2: 97, temp_c: 36.8, bp: "126/78" };
const base = { prior_date: "2026-08-14", current_date: "2026-11-20", pcp_on_file: true, insurance_on_file: true, preferred_language: "en" };
const T = {
  A: { ...base, indication: "Known lung adenocarcinoma on systemic therapy. Restaging chest film.", ordering_provider: onc,
    prior_report: "Upright PA chest. Lungs clear. No nodule or mass. Heart size normal. No effusion.",
    vitals: normalVitals, labs: [{ name: "Hemoglobin", value: "11.2 g/dL", flag: "L", date: "2026-11-18" }], problem_list: ["Lung adenocarcinoma, on treatment", "Former smoker"] },
  B: { ...base, indication: "Lung adenocarcinoma, response assessment after 3 cycles.", ordering_provider: onc,
    prior_report: "Upright PA chest. Right mid zone nodule. No effusion. Heart size normal.",
    vitals: normalVitals, labs: [{ name: "WBC", value: "6.1", flag: null, date: "2026-11-18" }], problem_list: ["Lung adenocarcinoma, on treatment"] },
  C: { ...base, indication: "Known lung nodule, follow-up after treatment.", ordering_provider: onc,
    prior_report: "Upright PA chest. Right mid zone nodule. No effusion.",
    vitals: normalVitals, labs: [], problem_list: ["Lung nodule, under surveillance"] },
  D: { ...base, indication: "Cough and chest discomfort. Known lung nodule on prior film. Portable chest film in the emergency department.",
    ordering_provider: { name: "Dr. M. Chen, ED (synthetic)", role: "ED" },
    prior_report: "Upright PA chest. Nodule right upper zone. CT chest recommended, not obtained.",
    vitals: { hr: 96, spo2: 95, temp_c: 37.1, bp: "138/84" }, labs: [], problem_list: ["Lung nodule, no follow-up on record"],
    pcp_on_file: false, insurance_on_file: false, preferred_language: "es" },
  E: { ...base, indication: "Surveillance chest film, history of resected lung cancer.", ordering_provider: onc,
    prior_report: "Upright PA chest. No acute abnormality.", vitals: normalVitals, labs: [], problem_list: ["Resected lung cancer, surveillance"] },
  F: { ...base, indication: "Lung mass on treatment. New shortness of breath.", ordering_provider: onc,
    prior_report: "Upright PA chest. Right mid zone mass. No effusion.",
    vitals: { hr: 104, spo2: 91, temp_c: 37.0, bp: "132/80" }, labs: [{ name: "LDH", value: "310 U/L", flag: "H", date: "2026-11-19" }], problem_list: ["Lung cancer, on treatment", "Dyspnea, new"] },
};

let n = 0;
for (const id of fs.readdirSync(DATA)) {
  const file = path.join(DATA, id, "case.json");
  if (!fs.existsSync(file)) continue;
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const tpl = T[c.case_id[0]];
  if (!tpl || c.synthetic_chart.indication) continue;
  const pid = String(c.nih.patient_id).padStart(6, "0");
  c.synthetic_chart = { ...c.synthetic_chart, ...tpl, mrn: `SYN-${pid}`, display_name: `Synthetic Patient ${pid}`,
    _note: "SYNTHETIC. Written by the team. Not from the patient record." };
  fs.writeFileSync(file, JSON.stringify(c, null, 2));
  n++;
}
console.log(`Seeded ${n} synthetic charts in ${DATA}`);
