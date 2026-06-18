"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildScalePitches,
  noteLabel,
  type GameConfig,
  type Note,
  type Timbre,
} from "@musicphone/shared";
import { ensureAudio, previewNote } from "@/lib/audio/engine";

const CELL_W = 22;
const ROW_H = 18;

const TIMBRE_COLOR: Record<Timbre, string> = {
  sine: "#4f9dde",
  triangle: "#39b58a",
  sawtooth: "#e0913a",
  square: "#c2569e",
};

interface Props {
  config: GameConfig;
  draft: Note[];
  /** Read-only previous measure shown ahead of the editable region. */
  contextNotes: Note[];
  selectedTimbre: Timbre;
  onChange: (notes: Note[]) => void;
  /** Optional playhead step within the editable region (for live playback). */
  playStep?: number | null;
}

/**
 * Scale-locked piano roll. The first measure is a greyed read-only preview of
 * the previous player's last measure; the following `measuresPerTurn` measures
 * are the editable region. Draw notes by click-dragging; click a note to delete.
 */
export function PianoRoll({ config, draft, contextNotes, selectedTimbre, onChange, playStep }: Props) {
  const pitches = buildScalePitches(config).slice().reverse(); // high pitch on top
  const editSteps = config.stepsPerMeasure * config.measuresPerTurn;
  const contextSteps = config.stepsPerMeasure;
  const totalSteps = contextSteps + editSteps;

  const gridRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{ pitch: number; start: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const locate = useCallback(
    (clientX: number, clientY: number): { pitch: number; step: number } | null => {
      const el = gridRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left + el.scrollLeft) / CELL_W);
      const row = Math.floor((clientY - rect.top + el.scrollTop) / ROW_H);
      const pitch = pitches[row];
      if (pitch === undefined) return null;
      const step = col - contextSteps; // negative inside the read-only context
      return { pitch, step };
    },
    [pitches, contextSteps],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = locate(e.clientX, e.clientY);
    if (!hit || hit.step < 0 || hit.step >= editSteps) return;

    const existing = draftRef.current.find(
      (n) => n.pitch === hit.pitch && hit.step >= n.start && hit.step < n.start + n.length,
    );
    if (existing) {
      onChange(draftRef.current.filter((n) => n !== existing));
      return;
    }

    const note: Note = { pitch: hit.pitch, start: hit.step, length: 1, timbre: selectedTimbre };
    onChange([...draftRef.current, note]);
    setDrawing({ pitch: hit.pitch, start: hit.step });
    void ensureAudio().then(() => previewNote(hit.pitch, selectedTimbre));
  };

  useEffect(() => {
    if (!drawing) return;
    const onMove = (e: MouseEvent) => {
      const hit = locate(e.clientX, e.clientY);
      if (!hit) return;
      const length = Math.min(
        Math.max(1, hit.step - drawing.start + 1),
        editSteps - drawing.start,
      );
      onChange(
        draftRef.current.map((n) =>
          n.pitch === drawing.pitch && n.start === drawing.start ? { ...n, length } : n,
        ),
      );
    };
    const onUp = () => setDrawing(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drawing, locate, editSteps, onChange]);

  const renderNote = (note: Note, offsetSteps: number, readOnly: boolean, key: string) => {
    const row = pitches.indexOf(note.pitch);
    if (row < 0) return null;
    return (
      <div
        key={key}
        className={`pr-note${readOnly ? " pr-note-ro" : ""}`}
        style={{
          left: (note.start + offsetSteps) * CELL_W,
          top: row * ROW_H,
          width: note.length * CELL_W - 2,
          height: ROW_H - 2,
          background: readOnly ? "#7a8190" : TIMBRE_COLOR[note.timbre],
        }}
      />
    );
  };

  return (
    <div className="pr-wrap">
      <div className="pr-labels" style={{ height: pitches.length * ROW_H }}>
        {pitches.map((p) => (
          <div key={p} className="pr-label" style={{ height: ROW_H }}>
            {noteLabel(p)}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="pr-grid"
        style={{ width: totalSteps * CELL_W, height: pitches.length * ROW_H }}
        onMouseDown={onMouseDown}
      >
        {/* Row striping */}
        {pitches.map((p, r) => (
          <div
            key={`row-${p}`}
            className={`pr-row${r % 2 ? " pr-row-alt" : ""}`}
            style={{ top: r * ROW_H, height: ROW_H, width: totalSteps * CELL_W }}
          />
        ))}

        {/* Context (read-only) region background */}
        <div
          className="pr-context"
          style={{ width: contextSteps * CELL_W, height: pitches.length * ROW_H }}
        />

        {/* Measure/beat grid lines */}
        {Array.from({ length: totalSteps + 1 }).map((_, c) => (
          <div
            key={`col-${c}`}
            className={`pr-col${c % config.stepsPerMeasure === 0 ? " pr-col-measure" : c % 4 === 0 ? " pr-col-beat" : ""}`}
            style={{ left: c * CELL_W, height: pitches.length * ROW_H }}
          />
        ))}

        {/* Playhead */}
        {playStep != null && playStep >= 0 && (
          <div
            className="pr-playhead"
            style={{ left: (playStep + contextSteps) * CELL_W, height: pitches.length * ROW_H }}
          />
        )}

        {contextNotes.map((n, i) => renderNote(n, 0, true, `ctx-${i}`))}
        {draft.map((n, i) => renderNote(n, contextSteps, false, `note-${i}`))}
      </div>
    </div>
  );
}
