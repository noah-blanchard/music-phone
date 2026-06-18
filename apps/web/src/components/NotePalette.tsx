"use client";

import { TIMBRES, type Timbre } from "@musicphone/shared";
import { ensureAudio, previewNote } from "@/lib/audio/engine";

const TIMBRE_COLOR: Record<Timbre, string> = {
  sine: "#4f9dde",
  triangle: "#39b58a",
  sawtooth: "#e0913a",
  square: "#c2569e",
};

const TIMBRE_LABEL: Record<Timbre, string> = {
  sine: "Sine",
  triangle: "Triangle",
  sawtooth: "Saw",
  square: "Square",
};

interface Props {
  selected: Timbre;
  onSelect: (t: Timbre) => void;
  onClear: () => void;
}

/** Timbre palette (per-note instrument) plus a clear-all action. */
export function NotePalette({ selected, onSelect, onClear }: Props) {
  return (
    <div className="palette">
      {TIMBRES.map((t) => (
        <button
          key={t}
          type="button"
          className={`palette-btn${selected === t ? " selected" : ""}`}
          style={{ borderColor: TIMBRE_COLOR[t] }}
          onClick={() => {
            onSelect(t);
            void ensureAudio().then(() => previewNote(67, t));
          }}
        >
          <span className="palette-swatch" style={{ background: TIMBRE_COLOR[t] }} />
          {TIMBRE_LABEL[t]}
        </button>
      ))}
      <button type="button" className="palette-btn clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
