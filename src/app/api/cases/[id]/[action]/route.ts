// Every action on a case. The case id is in the path. Nothing else about the patient is in a URL.
//   run       start the pipeline
//   review    accept, edit or reject one finding, with a reason
//   measure   the radiologist enters prior and current mm. Code recomputes RECIST
//   report    save a hand edit of the report text
//   sign      resident sign-off, then attending signature. Delivery follows the attending signature
//   open      the provider opened the result. Stops the timer
//   order     the provider signs the pre-filled follow-up order
//   informed  the provider marks the patient conversation done
import { NextResponse } from "next/server";
import { getCasePayload } from "@/components/data";
import { assertCaseId } from "@/lib/cases";
import {
  ChargeError, measure, providerInformed, providerOpen, providerSignOrder, review, saveReport, sign, startPipeline,
} from "@/lib/charge";

export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  try {
    assertCaseId(id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    switch (action) {
      case "run": startPipeline(id); break;
      case "review": {
        const r = body.review as { action?: string; reason?: string; text?: string } | null;
        if (r !== null && !["accepted", "edited", "rejected"].includes(String(r?.action))) throw new ChargeError("Unknown review action.", 400);
        review(id, String(body.finding_id), r === null ? null : { action: r.action as "accepted" | "edited" | "rejected", reason: r.reason, text: r.text });
        break;
      }
      case "measure": measure(id, { finding_id: String(body.finding_id), prior_mm: num(body.prior_mm), current_mm: num(body.current_mm) }); break;
      case "report": saveReport(id, String(body.text ?? "")); break;
      case "sign": {
        if (body.role !== "resident" && body.role !== "attending") throw new ChargeError("Role must be resident or attending.", 400);
        // No login in the demo: the signer is the role chosen in the header.
        sign(id, body.role, body.role === "resident" ? "Resident (demo role)" : "Attending radiologist (demo role)");
        break;
      }
      case "open": providerOpen(id); break;
      case "order": providerSignOrder(id, "Ordering provider (demo role)"); break;
      case "informed": providerInformed(id); break;
      default: return NextResponse.json({ error: "Unknown action." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, payload: getCasePayload(id) });
  } catch (e) {
    const status = e instanceof ChargeError ? e.status : 400;
    return NextResponse.json({ ok: false, error: String((e as Error).message ?? e) }, { status });
  }
}
