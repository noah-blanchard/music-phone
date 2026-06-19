"use client";

import { TIMBRES, type Timbre } from "@musicphone/shared";
import { ensureAudio, previewNote } from "@/lib/audio/engine";
import { uiClick } from "@/lib/audio/sfx";

const TIMBRE_COLOR: Record<Timbre, string> = {
  sine: "var(--t-sine)",
  triangle: "var(--t-triangle)",
  sawtooth: "var(--t-sawtooth)",
  square: "var(--t-square)",
};

const TIMBRE_LABEL: Record<Timbre, string> = {
  sine: "Sine",
  triangle: "Tri",
  sawtooth: "Saw",
  square: "Square",
};

interface Props {
  selected: Timbre;
  onSelect: (t: Timbre) => void;
}

/** Hardware timbre keys (per-note instrument selection). */
export function NotePalette({ selected, onSelect }: Props) {
  return (
    <div className="timbre-keys">
      {TIMBRES.map((t) => (
        <button
          key={t}
          type="button"
          className={`timbre-key${selected === t ? " selected" : ""}`}
          style={{ ["--tc" as string]: TIMBRE_COLOR[t] }}
          onClick={() => {
            uiClick();
            onSelect(t);
            void ensureAudio().then(() => previewNote(67, t));
          }}
        >
          <span className="timbre-swatch" />
          {TIMBRE_LABEL[t]}
        </button>
      ))}
    </div>
  );
}
