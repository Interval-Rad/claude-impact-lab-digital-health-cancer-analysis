"use client";
import { useEffect, useRef } from "react";
import { Syn } from "./common";

export type VState = { zoom: number; x: number; y: number; invert: boolean; bright: number; contrast: number; flicker: boolean; which: "prior" | "current" };
export const V0: VState = { zoom: 1, x: 0, y: 0, invert: false, bright: 1, contrast: 1, flicker: false, which: "current" };

type Props = { id: string; v: VState; set: (f: (p: VState) => VState) => void; priorLabel: string; currentLabel: string; highlight: string | null };

function Well({ id, which, v, set, label, highlight }: { id: string; which: "prior" | "current"; v: VState; set: Props["set"]; label: string; highlight: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; shift: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); set((p) => ({ ...p, zoom: Math.min(8, Math.max(0.5, p.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))) })); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [set]);

  return (
    <div ref={ref} className="image-well" role="img" aria-label={`${which} image`}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; }}
      onPointerMove={(e) => {
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y; drag.current = { ...d, x: e.clientX, y: e.clientY };
        if (d.shift) set((p) => ({ ...p, bright: Math.min(3, Math.max(0.2, p.bright + dx / 300)), contrast: Math.min(4, Math.max(0.2, p.contrast - dy / 300)) }));
        else set((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
      }}
      onPointerUp={() => (drag.current = null)} onDoubleClick={() => set((p) => ({ ...p, zoom: 1, x: 0, y: 0, bright: 1, contrast: 1 }))}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/cases/${id}/image/${which}`} alt="" draggable={false}
        style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`, filter: `brightness(${v.bright}) contrast(${v.contrast}) ${v.invert ? "invert(1)" : ""}` }} />
      <div className="well-label">{label}</div>
      {highlight && <div className="well-hl">{highlight}</div>}
    </div>
  );
}

export default function Viewer({ id, v, set, priorLabel, currentLabel, highlight }: Props) {
  return (
    <div className="wells">
      <div className="well-pair">
        {(!v.flicker || v.which === "prior") && <Well id={id} which="prior" v={v} set={set} label={`PRIOR ${priorLabel}`} highlight={highlight} />}
        {(!v.flicker || v.which === "current") && <Well id={id} which="current" v={v} set={set} label={`CURRENT ${currentLabel}`} highlight={highlight} />}
      </div>
      <div className="toolbar">
        <span>drag pan · wheel zoom · shift+drag brightness/contrast · double-click reset</span>
        <span><kbd>Space</kbd> flicker {v.flicker ? `(${v.which})` : "off"}</span>
        <span><kbd>I</kbd> invert {v.invert ? "on" : "off"}</span>
        <span className="mono">zoom {v.zoom.toFixed(1)}× · b {v.bright.toFixed(2)} · c {v.contrast.toFixed(2)}</span>
        <Syn />
      </div>
    </div>
  );
}
