"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}

export function usePoll<T>(url: string, ms = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const d = await api<T>(url); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError((e as Error).message); }
  }, [url]);
  useEffect(() => { alive.current = true; load(); const i = setInterval(load, ms); return () => { alive.current = false; clearInterval(i); }; }, [load, ms]);
  return { data, error, reload: load };
}

export const Syn = () => <span className="tag-syn">synthetic</span>;
export const hhmmss = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString([], { hour12: false }) : "");

export const TIER_GLYPH: Record<string, string> = { critical: "■ critical", high: "▲ high", routine: "● routine" };
export const SUBGROUP: Record<string, string> = {
  new_lesion_or_possible_new_diagnosis: "new lesion", urgent_incidental: "urgent incidental", progression_of_known_disease: "progression",
  indeterminate_needs_human: "indeterminate", stable_or_responding: "stable or responding",
};
export const AGREE: Record<string, string> = { "2_of_2": "2 of 2", status_differs: "reads differ !", "1_of_2": "1 of 2 !", single_read: "single read" };
export const STATUS_SHAPE: Record<string, string> = { new: "◆ new", increased: "▲ increased", decreased: "▼ decreased", stable: "■ stable", resolved: "○ resolved", indeterminate: "? indeterminate" };

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn" onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}>{done ? "Copied" : label}</button>;
}

/** Plays ElevenLabs audio from the server route, or the browser voice when no key is configured. Locked server side until the provider marks the patient informed. */
export function VoiceButton({ id, kind, label, unlocked }: { id: string; kind: "scheduling_call" | "family_page_read"; label: string; unlocked: boolean }) {
  const [msg, setMsg] = useState("");
  const play = async () => {
    setMsg("Preparing audio");
    try {
      const r = await api<{ script: string; audio_url: string | null; engine: string }>(`/api/cases/${id}/voice`, { kind });
      if (r.audio_url) { setMsg("Playing (ElevenLabs)"); const a = new Audio(r.audio_url); a.onended = () => setMsg(""); await a.play(); }
      else { setMsg("Playing (browser voice. No ElevenLabs key on the server)"); const u = new SpeechSynthesisUtterance(r.script); u.onend = () => setMsg(""); speechSynthesis.cancel(); speechSynthesis.speak(u); }
    } catch (e) { setMsg((e as Error).message); }
  };
  return <span><button className="btn" disabled={!unlocked} onClick={play} title={unlocked ? "" : "Locked until the provider marks the patient informed"}>{unlocked ? "▶" : "⊘"} {label}</button> <span className="muted mono">{unlocked ? msg : "locked until the provider marks the patient informed"}</span></span>;
}
