"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildChromaticWindow,
  buildScaleWindow,
  getRole,
  isBlackKey,
  loopSteps,
  noteLabel,
  type GameConfig,
  type Layer,
  type Note,
  type Role,
} from "@musicphone/shared";
import { ensureAudio, previewInstrument } from "@/lib/audio/engine";

const KEYS_W = 56;

interface Props {
  config: GameConfig;
  role: Role;
  draft: Note[];
  /** Read-only prior layers shown behind the grid (each in its role colour). */
  contextLayers: Layer[];
  onChange: (notes: Note[]) => void;
  playStep?: number | null;
}

/**
 * Scale-locked piano roll for a single layers-mode role. Rows span the role's
 * pitch window (chromatic, in-scale rows playable). The whole `barsPerSong` loop
 * is editable; prior layers are drawn read-only behind the grid. New notes take
 * the role colour and are previewed through the role's instrument.
 */
export function PianoRollEditor({ config, role, draft, contextLayers, onChange, playStep }: Props) {
  const windowRoot = config.root + role.octaveOffset * 12;
  const pitches = useMemo(
    () => buildChromaticWindow(windowRoot, role.octaves).slice().reverse(),
    [windowRoot, role.octaves],
  );
  const inScale = useMemo(
    () => new Set(buildScaleWindow(config.scale, windowRoot, role.octaves)),
    [config.scale, windowRoot, role.octaves],
  );
  const editSteps = loopSteps(config);
  const rows = pitches.length;

  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drawing, setDrawing] = useState<{ pitch: number; start: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const cellW = size.w / editSteps;
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
      return { pitch, step: col };
    },
    [cellW, rowH, pitches],
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

    const note: Note = { pitch: hit.pitch, start: hit.step, length: 1, timbre: "sine" };
    onChange([...draftRef.current, note]);
    setDrawing({ pitch: hit.pitch, start: hit.step });
    void ensureAudio().then(() => previewInstrument(role.instrumentId, hit.pitch));
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
    if (row < 0) return null; // outside this role's window (still audible via Play)
    const flash = !readOnly && litPitches.has(note.pitch);
    return (
      <div
        key={key}
        className={`pr-note${readOnly ? " pr-ctx" : ""}${flash ? " flash" : ""}`}
        style={{
          left: note.start * cellW,
          top: row * rowH + 1,
          width: Math.max(2, note.length * cellW - 1.5),
          height: Math.max(2, rowH - 2),
          ["--nc" as string]: color,
        }}
      />
    );
  };

  const ready = cellW > 0 && rowH > 0;

  return (
    <div className="pr">
      <div className="pr-keys" style={{ width: KEYS_W }}>
        {ready &&
          pitches.map((p, r) => {
            const lit = litPitches.has(p);
            const cls = lit ? "lit" : isBlackKey(p) ? "black" : "white";
            return (
              <div key={p} className={`pr-key ${cls}`} style={{ top: r * rowH, height: rowH }}>
                {p % 12 === config.root % 12 ? noteLabel(p) : ""}
              </div>
            );
          })}
      </div>

      <div ref={gridRef} className="pr-grid" onMouseDown={onMouseDown}>
        {ready && (
          <>
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

            {pitches.map((p, r) => (
              <div
                key={`rl-${p}`}
                className="pr-rowline"
                style={{ top: (r + 1) * rowH - 1, width: size.w }}
              />
            ))}

            {Array.from({ length: editSteps + 1 }).map((_, c) => {
              const cls = c % config.stepsPerMeasure === 0 ? "measure" : c % 4 === 0 ? "beat" : "";
              return (
                <div
                  key={`col-${c}`}
                  className={`pr-col ${cls}`}
                  style={{ left: c * cellW, height: size.h }}
                />
              );
            })}

            {playStep != null && playStep >= 0 && (
              <div className="pr-playhead" style={{ left: playStep * cellW, height: size.h }} />
            )}

            {/* Prior layers (read-only background) */}
            {contextLayers.flatMap((layer, li) => {
              const color = getRole(layer.roleId)?.color ?? "#888";
              return layer.notes.map((n, ni) => renderNote(n, color, true, `ctx-${li}-${ni}`));
            })}

            {/* Local draft */}
            {draft.map((n, i) => renderNote(n, role.color, false, `note-${i}`))}
          </>
        )}
      </div>
    </div>
  );
}
