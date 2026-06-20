"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PIANO_MAX,
  PIANO_MIN,
  SCALE_INTERVALS,
  buildChromaticWindow,
  isBlackKey,
  loopSteps,
  noteLabel,
  getRole,
  type GameConfig,
  type Layer,
  type Note,
  type Role,
} from "@musicphone/shared";
import { ensureAudio, previewInstrument } from "@/lib/audio/engine";

const KEYS_W = 56;
const ROW_H = 22; // fixed row height — the roll scrolls instead of squishing

interface Props {
  config: GameConfig;
  role: Role;
  /** Sound id used for placement preview. */
  instrumentId: string;
  /** When true, out-of-scale notes are placeable (scale-lock off). */
  unlocked: boolean;
  draft: Note[];
  /** Read-only prior layers shown behind the grid (each in its role colour). */
  contextLayers: Layer[];
  onChange: (notes: Note[]) => void;
  playStep?: number | null;
}

/**
 * Full-range, vertically scrollable piano roll for a layers-mode pitched role.
 * Rows span C2..C7; the whole loop fits horizontally. On load it auto-scrolls to
 * the role's focus window (bass low, melody high). Scale-lock is on by default
 * (out-of-scale rows blacked out & non-placeable) and can be toggled off.
 */
export function PianoRollEditor({
  config,
  role,
  instrumentId,
  unlocked,
  draft,
  contextLayers,
  onChange,
  playStep,
}: Props) {
  const pitches = useMemo(
    () => buildChromaticWindow(PIANO_MIN, (PIANO_MAX - PIANO_MIN) / 12).slice().reverse(),
    [],
  );
  const inScale = useCallback(
    (p: number) => {
      const cls = ((p - config.root) % 12 + 12) % 12;
      return SCALE_INTERVALS[config.scale].includes(cls);
    },
    [config.root, config.scale],
  );
  const editSteps = loopSteps(config);
  const rows = pitches.length;
  const contentH = rows * ROW_H;

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
  const [drawing, setDrawing] = useState<{ pitch: number; start: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setGridW(el.clientWidth));
    ro.observe(el);
    setGridW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const cellW = gridW / editSteps;

  // Auto-scroll to the role's focus window once measured / when the role changes.
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const focusPitch = config.root + role.octaveOffset * 12 + Math.round(role.octaves * 6);
    let idx = pitches.indexOf(focusPitch);
    if (idx < 0) idx = Math.round(rows / 2);
    sc.scrollTop = Math.max(0, idx * ROW_H - sc.clientHeight / 2);
  }, [config.root, role.octaveOffset, role.octaves, pitches, rows]);

  const locate = useCallback(
    (clientX: number, clientY: number): { pitch: number; step: number } | null => {
      const el = gridRef.current;
      if (!el || cellW <= 0) return null;
      const rect = el.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / cellW);
      const row = Math.floor((clientY - rect.top) / ROW_H);
      const pitch = pitches[row];
      if (pitch === undefined) return null;
      return { pitch, step: col };
    },
    [cellW, pitches],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    const hit = locate(e.clientX, e.clientY);
    if (!hit || hit.step < 0 || hit.step >= editSteps) return;
    if (!unlocked && !inScale(hit.pitch)) return;

    const existing = draftRef.current.find(
      (n) => n.pitch === hit.pitch && hit.step >= n.start && hit.step < n.start + n.length,
    );
    if (existing) {
      onChange(draftRef.current.filter((n) => n !== existing));
      return;
    }

    const note: Note = { pitch: hit.pitch, start: hit.step, length: 1, timbre: "sine" };
    onChange([...draftRef.current, note]);
    setDrawing({ pitch: hit.pitch, start: hit.step });
    void ensureAudio().then(() => previewInstrument(instrumentId, hit.pitch));
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

  const litPitches = useMemo(() => {
    const lit = new Set<number>();
    if (playStep != null && playStep >= 0) {
      for (const n of draft) {
        if (playStep >= n.start && playStep < n.start + n.length) lit.add(n.pitch);
      }
    }
    return lit;
  }, [playStep, draft]);

  const renderNote = (note: Note, color: string, readOnly: boolean, key: string) => {
    const row = pitches.indexOf(note.pitch);
    if (row < 0) return null;
    const flash = !readOnly && litPitches.has(note.pitch);
    return (
      <div
        key={key}
        className={`pr-note${readOnly ? " pr-ctx" : ""}${flash ? " flash" : ""}`}
        style={{
          left: note.start * cellW,
          top: row * ROW_H + 1,
          width: Math.max(2, note.length * cellW - 1.5),
          height: ROW_H - 2,
          ["--nc" as string]: color,
        }}
      />
    );
  };

  const ready = cellW > 0;

  return (
    <div className="pr">
      <div ref={scrollRef} className="pr-scroll">
        {/* Piano keyboard gutter */}
        <div className="pr-keys" style={{ width: KEYS_W, height: contentH }}>
          {pitches.map((p, r) => {
            const locked = !unlocked && !inScale(p);
            const lit = litPitches.has(p);
            const cls = locked ? "locked" : lit ? "lit" : isBlackKey(p) ? "black" : "white";
            return (
              <div key={p} className={`pr-key ${cls}`} style={{ top: r * ROW_H, height: ROW_H }}>
                {p % 12 === config.root % 12 ? noteLabel(p) : ""}
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div ref={gridRef} className="pr-grid" style={{ height: contentH }} onMouseDown={onMouseDown}>
          {ready && (
            <>
              {pitches.map((p, r) => {
                const locked = !unlocked && !inScale(p);
                const offscale = unlocked && !inScale(p);
                const isRoot = p % 12 === config.root % 12;
                const cls = locked
                  ? "locked"
                  : `in-scale${isRoot ? " root" : ""}${offscale ? " offscale" : ""}${r % 2 ? " alt" : ""}`;
                return (
                  <div
                    key={`row-${p}`}
                    className={`pr-row ${cls}`}
                    style={{ top: r * ROW_H, height: ROW_H, width: gridW }}
                  />
                );
              })}

              {pitches.map((p, r) => (
                <div
                  key={`rl-${p}`}
                  className="pr-rowline"
                  style={{ top: (r + 1) * ROW_H - 1, width: gridW }}
                />
              ))}

              {Array.from({ length: editSteps + 1 }).map((_, c) => {
                const cls = c % config.stepsPerMeasure === 0 ? "measure" : c % 4 === 0 ? "beat" : "";
                return (
                  <div
                    key={`col-${c}`}
                    className={`pr-col ${cls}`}
                    style={{ left: c * cellW, height: contentH }}
                  />
                );
              })}

              {playStep != null && playStep >= 0 && (
                <div className="pr-playhead" style={{ left: playStep * cellW, height: contentH }} />
              )}

              {contextLayers.flatMap((layer, li) => {
                const color = getRole(layer.roleId)?.color ?? "#888";
                return layer.notes.map((n, ni) => renderNote(n, color, true, `ctx-${li}-${ni}`));
              })}

              {draft.map((n, i) => renderNote(n, role.color, false, `note-${i}`))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
