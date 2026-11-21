import fs from "fs";
import path from "path";
import { startCase, worklist } from "@/lib/charge";
import { caseDir, listCaseIds, readState, validId } from "@/lib/store";
import { ChargeError } from "@/lib/charge";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";
export const GET = () => handle(() => ({ rows: worklist() }));

const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** JSON {case_id} starts a stored case. Multipart (prior, current, case_json) uploads a new one. Either starts the pipeline. */
export async function POST(req: Request) {
  return handle(async () => {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await req.formData();
      const prior = f.get("prior"), current = f.get("current"), cj = f.get("case_json");
      if (!(prior instanceof File) || !(current instanceof File) || typeof cj !== "string") throw new ChargeError("prior, current and case_json are required", 400);
      const pb = Buffer.from(await prior.arrayBuffer()), cb = Buffer.from(await current.arrayBuffer());
      if (!isPng(pb) || !isPng(cb)) throw new ChargeError("images must be PNG", 400);
      if (pb.length > 25e6 || cb.length > 25e6) throw new ChargeError("image too large", 413);
      const meta = JSON.parse(cj);
      if (!meta?.nih?.prior || !meta?.nih?.current || !meta?.synthetic_chart) throw new ChargeError("case_json needs nih and synthetic_chart", 400);
      const id = `U_${Date.now()}`;
      meta.case_id = id; meta.category_hint = String(meta.category_hint ?? "X_upload");
      fs.mkdirSync(caseDir(id), { recursive: true });
      fs.writeFileSync(path.join(caseDir(id), "prior.png"), pb); fs.writeFileSync(path.join(caseDir(id), "current.png"), cb);
      fs.writeFileSync(path.join(caseDir(id), "case.json"), JSON.stringify(meta, null, 2));
      return { case_id: id, state: startCase(id).state };
    }
    const { case_id } = (await req.json().catch(() => ({}))) as { case_id?: string };
    if (!case_id || !validId(case_id) || !listCaseIds().includes(case_id)) throw new ChargeError("unknown case", 404);
    return { case_id, state: (readState(case_id) ?? startCase(case_id)).state };
  });
}
