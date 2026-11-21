"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export const DEMO_FACTOR = 180; // 60 demo minutes = 20 real seconds

export function useRole() {
  const p = usePathname();
  return p.startsWith("/inbox") ? "provider" : "radiology";
}
export function toggleTheme(role: string) {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next; localStorage.setItem(`theme:${role}`, next);
}

export default function Header() {
  const role = useRole();
  const [clock, setClock] = useState("08:00:00");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    document.documentElement.dataset.role = role;
    const t = localStorage.getItem(`theme:${role}`) ?? (role === "provider" ? "light" : "dark");
    document.documentElement.dataset.theme = t; setTheme(t);
  }, [role]);

  useEffect(() => {
    const start = Number(localStorage.getItem("demoStart") ?? Date.now()); localStorage.setItem("demoStart", String(start));
    const f = () => {
      const s = 8 * 3600 + Math.floor(((Date.now() - start) / 1000) * DEMO_FACTOR);
      const hh = String(Math.floor(s / 3600) % 24).padStart(2, "0"), mm = String(Math.floor(s / 60) % 60).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    f(); const i = setInterval(f, 500); return () => clearInterval(i);
  }, []);

  const onTheme = useCallback(() => { toggleTheme(role); setTheme(document.documentElement.dataset.theme ?? "dark"); }, [role]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input, textarea, select")) return;
      if (e.key.toLowerCase() === "d" && !e.metaKey && !e.ctrlKey) onTheme();
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onTheme]);

  return (
    <header className="hdr">
      <Link href="/" style={{ textDecoration: "none", letterSpacing: "0.12em", fontWeight: 500 }}>INTERVAL READ</Link>
      <span className="seg" role="group" aria-label="Role">
        <Link href="/" className={role === "radiology" ? "on" : ""}>Radiology</Link>
        <Link href="/inbox" className={role === "provider" ? "on" : ""}>Ordering provider</Link>
      </span>
      <Link href="/registry" className="muted" style={{ textDecoration: "none" }}>Registry</Link>
      <span className="grow" />
      <button className="btn" onClick={onTheme} aria-label="Toggle theme (D)">theme: {theme === "dark" ? "reading room" : "paper chart"} [D]</button>
      <span title="Demo clock. 60 minutes runs as 20 seconds.">demo clock <b>{clock}</b></span>
    </header>
  );
}
