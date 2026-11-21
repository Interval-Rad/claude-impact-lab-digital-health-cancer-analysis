"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Syn } from "./format";

const VIEWS = ["PA", "AP", "unknown"] as const;

function Row({ id, label, syn, children }: { id: string; label: string; syn?: boolean; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row" className="w-[22ch] py-1 pr-3 text-left align-top font-normal">
        <label htmlFor={id} className="label">
          {label}
        </label>{" "}
        {syn && <Syn />}
      </th>
      <td className="py-1">{children}</td>
    </tr>
  );
}

// Upload a prior and current image with a typed, synthetic order. The server starts the pipeline on success.
export default function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cases", { method: "POST", body: new FormData(e.currentTarget) });
      const json = (await res.json().catch(() => ({}))) as { case_id?: string; error?: string };
      if (!res.ok || !json.case_id) {
        setError(json.error ?? `Upload failed (${res.status})`);
        setBusy(false);
        return;
      }
      router.push(`/case/${encodeURIComponent(json.case_id)}`);
    } catch (err) {
      setError(`Could not reach the server: ${String((err as Error).message ?? err)}`);
      setBusy(false);
    }
  }

  const text = (id: string, required = true, type = "text") => (
    <input id={`up-${id}`} name={id} type={type} required={required} className="field w-full max-w-[44ch]" autoComplete="off" />
  );
  const view = (id: string) => (
    <select id={`up-${id}`} name={id} defaultValue="unknown" className="field">
      {VIEWS.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
  const file = (id: string) => (
    <input id={`up-${id}`} name={id} type="file" required accept="image/jpeg,image/png,image/webp" className="data text-[12px]" />
  );

  return (
    <form onSubmit={submit} className="px-[10px] pb-3">
      <p className="mb-2">
        Public, de-identified images only. <span className="text-muted">Uploading starts the AI first read for this pair.</span>
      </p>
      <table className="border-collapse">
        <tbody>
          <Row id="up-case_id" label="Case id">
            <input
              id="up-case_id" name="case_id" required pattern="[A-Za-z0-9_\-]{1,64}" className="field w-full max-w-[44ch]"
              autoComplete="off" aria-describedby="up-case_id-hint"
            />
            <div id="up-case_id-hint" className="data text-[11px] text-muted">
              letters, digits, _ and -, up to 64
            </div>
          </Row>
          <Row id="up-prior" label="Prior image">{file("prior")}</Row>
          <Row id="up-prior_view" label="Prior view">{view("prior_view")}</Row>
          <Row id="up-current" label="Current image">{file("current")}</Row>
          <Row id="up-current_view" label="Current view">{view("current_view")}</Row>
          <Row id="up-display_name" label="Patient name" syn>{text("display_name")}</Row>
          <Row id="up-mrn" label="MRN" syn>{text("mrn")}</Row>
          <Row id="up-prior_date" label="Prior study date" syn>{text("prior_date", true, "date")}</Row>
          <Row id="up-current_date" label="Current study date" syn>{text("current_date", true, "date")}</Row>
          <Row id="up-indication" label="Indication" syn>{text("indication")}</Row>
          <Row id="up-provider_name" label="Ordering provider" syn>{text("provider_name")}</Row>
          <Row id="up-provider_role" label="Provider role" syn>{text("provider_role")}</Row>
          <Row id="up-prior_report" label="Prior report" syn>
            <textarea id="up-prior_report" name="prior_report" rows={4} className="field w-full max-w-[72ch]" />
          </Row>
          <Row id="up-pcp_on_file" label="PCP on file" syn>
            <select id="up-pcp_on_file" name="pcp_on_file" defaultValue="yes" className="field">
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </Row>
        </tbody>
      </table>
      <div className="mt-2 flex items-baseline gap-3">
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Uploading" : "Upload and start first read"}
        </button>
        <span role="status" className="data">
          {error && <span className="attn">! Upload failed: {error}</span>}
        </span>
      </div>
    </form>
  );
}
