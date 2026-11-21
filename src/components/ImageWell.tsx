"use client";
import { useState } from "react";
import { Syn } from "./format";
import type { StudySide } from "./types";

type Props = {
  images: { prior: string; current: string };
  prior: StudySide;
  current: StudySide;
  /** Text shown over the well when a finding is selected. A label only: nothing is drawn on the image. */
  regionLabel: string | null;
};

function PaneLabel({ name, side }: { name: string; side: StudySide }) {
  return (
    <div className="data flex items-baseline gap-2 border-b border-rule bg-surface px-2 py-1 text-[11px]">
      <span className="font-medium tracking-[0.12em]">{name}</span>
      <span>{side.view}</span>
      {side.date ? (
        <>
          <span>{side.date}</span>
          <Syn />
        </>
      ) : (
        <span className="text-muted">date not on file</span>
      )}
    </div>
  );
}

export default function ImageWell({ images, prior, current, regionLabel }: Props) {
  const [invert, setInvert] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [flicker, setFlicker] = useState(false);
  const [showing, setShowing] = useState<"prior" | "current">("current");

  const filter = `invert(${invert ? 1 : 0}) brightness(${brightness}%) contrast(${contrast}%)`;
  const img = (which: "prior" | "current", hidden = false) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={images[which]}
      alt={`${which === "prior" ? "Prior" : "Current"} chest radiograph, ${(which === "prior" ? prior : current).view} view`}
      className="absolute inset-0 h-full w-full object-contain"
      style={{ filter, visibility: hidden ? "hidden" : "visible" }}
      draggable={false}
    />
  );

  return (
    <section aria-label="Images" className="border-b border-rule">
      <div className="image-well relative">
        {flicker ? (
          <div>
            <PaneLabel name={showing === "prior" ? "PRIOR" : "CURRENT"} side={showing === "prior" ? prior : current} />
            <div className="relative" style={{ height: "clamp(280px, 50vh, 900px)" }}>
              {/* Both stay mounted so the swap is instant. */}
              {img("prior", showing !== "prior")}
              {img("current", showing !== "current")}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2">
            <div className="border-r border-rule">
              <PaneLabel name="PRIOR" side={prior} />
              <div className="relative" style={{ height: "clamp(280px, 50vh, 900px)" }}>{img("prior")}</div>
            </div>
            <div>
              <PaneLabel name="CURRENT" side={current} />
              <div className="relative" style={{ height: "clamp(280px, 50vh, 900px)" }}>{img("current")}</div>
            </div>
          </div>
        )}
        <div
          aria-live="polite"
          className="data pointer-events-none absolute inset-x-0 bottom-0 px-2 py-1 text-[12px]"
          style={{ background: regionLabel ? "#000" : "transparent" }}
        >
          {regionLabel && (
            <>
              <span className="label mr-2">selected finding, region</span>
              {regionLabel}
              <span className="ml-2 text-muted">(label only, nothing is drawn on the image)</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule bg-surface px-2 py-1">
        <span className="label">Display</span>
        <button type="button" className="btn" aria-pressed={invert} onClick={() => setInvert((v) => !v)}>
          Invert: {invert ? "on" : "off"}
        </button>
        <label className="data text-[11px]">
          Brightness{" "}
          <input
            type="range" className="slider" min={30} max={250} step={5} value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
          />{" "}
          <span className="inline-block w-[4ch] text-right">{brightness}%</span>
        </label>
        <label className="data text-[11px]">
          Contrast{" "}
          <input
            type="range" className="slider" min={30} max={300} step={5} value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
          />{" "}
          <span className="inline-block w-[4ch] text-right">{contrast}%</span>
        </label>
        <button
          type="button" className="btn"
          onClick={() => { setInvert(false); setBrightness(100); setContrast(100); }}
        >
          Reset
        </button>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className="btn" aria-pressed={flicker} onClick={() => setFlicker((v) => !v)}>
            Flicker: {flicker ? "on" : "off"}
          </button>
          <button
            type="button" className="btn" disabled={!flicker}
            onClick={() => setShowing((s) => (s === "prior" ? "current" : "prior"))}
          >
            {flicker ? `Swap (showing ${showing})` : "Swap"}
          </button>
        </span>
      </div>
    </section>
  );
}
