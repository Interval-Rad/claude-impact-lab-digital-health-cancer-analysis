import fs from "fs";
import path from "path";
import { ChargeError, voiceScripts } from "@/lib/charge";
import { caseDir, audit, readState } from "@/lib/store";
import { body, handle, idOf, type Ctx } from "@/lib/http";

// ElevenLabs text to speech, server side. The key never reaches the client. Audio is cached per case.
const KINDS = ["scheduling_call", "family_page_read"] as const;
type Kind = (typeof KINDS)[number];

export const POST = async (req: Request, ctx: Ctx) => {
  const id = await idOf(ctx); const b = await body<{ kind: Kind }>(req);
  return handle(async () => {
    if (!KINDS.includes(b.kind)) throw new ChargeError("kind must be scheduling_call or family_page_read", 400);
    const s = await voiceScripts(id); // throws 403 unless PATIENT_INFORMED
    const script = s.voice![b.kind];
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return { script, audio_url: null, engine: "browser" };
    const file = path.join(caseDir(id), `voice_${b.kind}.mp3`);
    if (!fs.existsSync(file)) {
      const voice = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: script, model_id: "eleven_multilingual_v2" }),
      });
      if (!r.ok) throw new ChargeError(`ElevenLabs error ${r.status}`, 502);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      audit({ case_id: id, actor: "courier", event: "voice", after: b.kind });
    }
    return { script, audio_url: `/api/cases/${id}/voice?kind=${b.kind}`, engine: "elevenlabs" };
  });
};

export async function GET(req: Request, ctx: Ctx) {
  const id = await idOf(ctx); const kind = new URL(req.url).searchParams.get("kind");
  if (!KINDS.includes(kind as Kind)) return new Response("bad kind", { status: 400 });
  if (readState(id)?.state !== "PATIENT_INFORMED") return new Response("locked", { status: 403 });
  const file = path.join(caseDir(id), `voice_${kind}.mp3`);
  if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), { headers: { "Content-Type": "audio/mpeg" } });
}
