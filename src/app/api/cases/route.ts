// GET: the worklist, sorted. POST: upload a prior and current image with a synthetic order.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getWorklist } from "@/components/data";
import { assertCaseId, CASES_DIR } from "@/lib/cases";
import { isReplay } from "@/lib/config";
import { startPipeline } from "@/lib/charge";
import { sniffMediaType } from "@/lib/images";
import { CaseFile } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ rows: getWorklist() });
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export async function POST(request: Request) {
  if (isReplay()) {
    return NextResponse.json(
      { error: "Uploads need a live run. This server is in replay mode and can only show the recorded example cases. Start it with an API key (npm run dev) to read new images." },
      { status: 409 }
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Uploads need an API key. Put ANTHROPIC_API_KEY in .env.local and restart, or use the recorded example cases." },
      { status: 409 }
    );
  }
  try {
    const form = await request.formData();
    const text = (k: string) => String(form.get(k) ?? "").trim();
    const id = assertCaseId(text("case_id"));
    const dir = path.join(CASES_DIR, id);
    if (fs.existsSync(dir)) return NextResponse.json({ error: "A case with this id already exists." }, { status: 409 });
    if (!text("indication")) {
      return NextResponse.json({ error: "Type the reason for the scan. The focused pass and the report need it. It stays hidden from the blind reads." }, { status: 400 });
    }
    const images = {} as Record<"prior" | "current", { bytes: Buffer; media: keyof typeof EXT; view: string }>;
    for (const which of ["prior", "current"] as const) {
      const file = form.get(which);
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: `Missing ${which} image.` }, { status: 400 });
      if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: `${which} image is over 20 MB.` }, { status: 400 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const view = text(`${which}_view`);
      images[which] = { bytes, media: sniffMediaType(bytes), view: view === "PA" || view === "AP" ? view : "unknown" };
    }
    const image = (which: "prior" | "current") => ({
      file: `${which}.${EXT[images[which].media]}`, media_type: images[which].media,
      nih: { image_id: `upload_${which}`, label_names: [], patient_id: "upload", view_position: images[which].view },
    });
    const caseFile = CaseFile.parse({
      case_id: id, source: "Uploaded in the demo. The uploader is responsible for using public, de-identified images only.",
      prior: image("prior"), current: image("current"),
      synthetic_chart: {
        mrn: text("mrn"), display_name: text("display_name"), prior_date: text("prior_date"), current_date: text("current_date"),
        indication: text("indication"), ordering_provider: { name: text("provider_name"), role: text("provider_role") },
        prior_report: text("prior_report"), vitals: { hr: null, spo2: null, temp_c: null, bp: "" }, labs: [], problem_list: [],
        pcp_on_file: form.get("pcp_on_file") !== "no", insurance_on_file: true, preferred_language: "en",
      },
    });
    fs.mkdirSync(dir, { recursive: true });
    for (const which of ["prior", "current"] as const) fs.writeFileSync(path.join(dir, caseFile[which].file), images[which].bytes);
    fs.writeFileSync(path.join(dir, "case.json"), JSON.stringify({ ...caseFile, synthetic_chart: { _note: "SYNTHETIC. Typed into the upload form.", ...caseFile.synthetic_chart } }, null, 2));
    startPipeline(id); // upload triggers the AI
    return NextResponse.json({ case_id: id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 });
  }
}
