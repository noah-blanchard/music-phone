"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildChromaticRange,
  buildScalePitches,
  isBlackKey,
  noteLabel,
  type GameConfig,
  type Note,
  type Timbre,
} from "@musicphone/shared";
import { ensureAudio, previewNote } from "@/lib/audio/engine";

const KEYS_W = 56; // piano-keyboard gutter width (px)

const TIMBRE_COLOR: Record<Timbre, string> = {
  sine: "var(--t-sine)",
  triangle: "var(--t-triangle)",
  sawtooth: "var(--t-sawtooth)",
  square: "var(--t-square)",
};

interface Props {
  config: GameConfig;
  draft: Note[];
  /** Read-only previous measure shown ahead of the editable region. */
  contextNotes: Note[];
  selectedTimbre: Timbre;
  onChange: (notes: Note[]) => void;
  /** Playhead step within the editable region during local playback. */
  playStep?: number | null;
}

/**
 * Full-screen, scale-locked piano roll. Rows are a full chromatic keyboard:
 * in-scale rows are playable, out-of-scale rows are dimmed and locked. The grid
 * auto-sizes to its container (no scrolling). The first measure is a read-only
 * preview of the previous player's last measure; the next `measuresPerTurn` are
 * editable. Draw notes by click-dragging; click a note to delete.
 */
export function PianoRoll({ config, draft, contextNotes, selectedTimbre, onChange, playStep }: Props) {
  const pitches = useMemo(() => buildChromaticRange(config).slice().reverse(), [config]); // high on top
  const inScale = useMemo(() => new Set(buildScalePitches(config)), [config]);
  const editSteps = config.stepsPerMeasure * config.measuresPerTurn;
  const contextSteps = config.stepsPerMeasure;
  const totalSteps = contextSteps + editSteps;
  const rows = pitches.length;

  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState<{ pitch: number; start: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Auto-fit the grid to its container.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cellW = size.w / totalSteps;
  const rowH = size.h / rows;

  const locate = useCallback(
    (clientX: number, clientY: number): { pitch: number; step: number } | null => {
      const el = gridRef.current;
      if (!el || cellW <= 0 || rowH <= 0) return null;
      const rect = el.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / cellW);
      const row = Math.floor((clientY - rect.top) / rowH);
      const pitch = pitches[row];
      if (pitch === undefined) return null;
      return { pitch, step: col - contextSteps };
    },
    [cellW, rowH, pitches, contextSteps],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = locate(e.clientX, e.clientY);
    if (!hit || hit.step < 0 || hit.step >= editSteps || !inScale.has(hit.pitch)) return;

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
      const length = Math.min(Math.max(1, hit.step - drawing.start + 1), editSteps - drawing.start);
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

  // Which pitches are sounding right now (for note flash + key lighting).
  const litPitches = useMemo(() => {
    const lit = new Set<number>();
    if (playStep != null && playStep >= 0) {
      for (const n of draft) {
        if (playStep >= n.start && playStep < n.start + n.length) lit.add(n.pitch);
      }
    }
    return lit;
  }, [playStep, draft]);

  const renderNote = (note: Note, offsetSteps: number, readOnly: boolean, key: string) => {
    const row = pitches.indexOf(note.pitch);
    if (row < 0) return null;
    const flash = !readOnly && litPitches.has(note.pitch);
    return (
      <div
        key={key}
        className={`pr-note${readOnly ? " ro" : ""}${flash ? " flash" : ""}`}
        style={{
          left: (note.start + offsetSteps) * cellW,
          top: row * rowH + 1,
          width: Math.max(2, note.length * cellW - 1.5),
          height: Math.max(2, rowH - 2),
          ["--nc" as string]: readOnly ? undefined : TIMBRE_COLOR[note.timbre],
        }}
      />
    );
  };

  const ready = cellW > 0 && rowH > 0;

  return (
    <div className="pr">
      {/* Piano keyboard gutter */}
      <div className="pr-keys" style={{ width: KEYS_W }}>
        {ready &&
          pitches.map((p, r) => {
            const lit = litPitches.has(p);
            const cls = lit ? "lit" : isBlackKey(p) ? "black" : "white";
            return (
              <div
                key={p}
                className={`pr-key ${cls}`}
                style={{ top: r * rowH, height: rowH }}
              >
                {p % 12 === config.root % 12 ? noteLabel(p) : ""}
              </div>
            );
          })}
      </div>

      {/* Grid */}
      <div ref={gridRef} className="pr-grid" onMouseDown={onMouseDown}>
        {ready && (
          <>
            {/* Row backgrounds (locked / in-scale / root) */}
            {pitches.map((p, r) => {
              const locked = !inScale.has(p);
              const isRoot = p % 12 === config.root % 12;
              const cls = locked
                ? "locked"
                : `in-scale${isRoot ? " root" : ""}${r % 2 ? " alt" : ""}`;
              return (
                <div
                  key={`row-${p}`}
                  className={`pr-row ${cls}`}
                  style={{ top: r * rowH, height: rowH, width: size.w }}
                />
              );
            })}

            {/* Horizontal row separators */}
            {pitches.map((p, r) => (
              <div
                key={`rl-${p}`}
                className="pr-rowline"
                style={{ top: (r + 1) * rowH - 1, width: size.w }}
              />
            ))}

            {/* Read-only context region */}
            <div className="pr-context" style={{ width: contextSteps * cellW, height: size.h }} />
            <span className="pr-context-label">prev</span>

            {/* Vertical beat/measure lines */}
            {Array.from({ length: totalSteps + 1 }).map((_, c) => {
              const cls =
                c % config.stepsPerMeasure === 0 ? "measure" : c % 4 === 0 ? "beat" : "";
              return (
                <div
                  key={`col-${c}`}
                  className={`pr-col ${cls}`}
                  style={{ left: c * cellW, height: size.h }}
                />
              );
            })}

            {/* Playhead */}
            {playStep != null && playStep >= 0 && (
              <div
                className="pr-playhead"
                style={{ left: (playStep + contextSteps) * cellW, height: size.h }}
              />
            )}

            {contextNotes.map((n, i) => renderNote(n, 0, true, `ctx-${i}`))}
            {draft.map((n, i) => renderNote(n, contextSteps, false, `note-${i}`))}
          </>
        )}
      </div>
    </div>
  );
}
