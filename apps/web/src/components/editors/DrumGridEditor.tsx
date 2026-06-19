"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getRole, loopSteps, type GameConfig, type Layer, type Note, type Role } from "@musicphone/shared";
import { DRUM_LANES } from "@/lib/audio/drums";
import { ensureAudio, previewDrum } from "@/lib/audio/engine";

const KEYS_W = 56;

interface Props {
  config: GameConfig;
  role: Role;
  draft: Note[];
  contextLayers: Layer[];
  onChange: (notes: Note[]) => void;
  playStep?: number | null;
}

/**
 * Step-sequencer drum grid. Rows are the kit lanes (`DRUM_LANES`, index = note
 * pitch), columns are the loop steps. Click a cell to toggle a hit. Prior drum
 * layers are shown faintly behind the grid; everything is audible on Play.
 */
export function DrumGridEditor({ config, role, draft, contextLayers, onChange, playStep }: Props) {
  const lanes = DRUM_LANES;
  const editSteps = loopSteps(config);
  const rows = lanes.length;

  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
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

  const toggle = useCallback(
    (clientX: number, clientY: number) => {
      const el = gridRef.current;
      if (!el || cellW <= 0 || rowH <= 0) return;
      const rect = el.getBoundingClientRect();
      const step = Math.floor((clientX - rect.left) / cellW);
      const lane = Math.floor((clientY - rect.top) / rowH);
      if (lane < 0 || lane >= rows || step < 0 || step >= editSteps) return;

      const existing = draftRef.current.find((n) => n.pitch === lane && n.start === step);
      if (existing) {
        onChange(draftRef.current.filter((n) => n !== existing));
        return;
      }
      onChange([...draftRef.current, { pitch: lane, start: step, length: 1, timbre: "sine" }]);
      void ensureAudio().then(() => previewDrum(lane));
    },
    [cellW, rowH, rows, editSteps, onChange],
  );

  const drumContext = useMemo(
    () => contextLayers.filter((l) => getRole(l.roleId)?.editor === "drum-grid"),
    [contextLayers],
  );

  const ready = cellW > 0 && rowH > 0;

  const cell = (lane: number, step: number, color: string, readOnly: boolean, key: string) => {
    const flash = !readOnly && playStep === step;
    return (
      <div
        key={key}
        className={`dg-hit${readOnly ? " dg-ctx" : ""}${flash ? " flash" : ""}`}
        style={{
          left: step * cellW + 1,
          top: lane * rowH + 1,
          width: Math.max(2, cellW - 2),
          height: Math.max(2, rowH - 2),
          ["--nc" as string]: color,
        }}
      />
    );
  };

  return (
    <div className="pr">
      <div className="pr-keys" style={{ width: KEYS_W }}>
        {ready &&
          lanes.map((l) => (
            <div key={l.id} className="pr-key white dg-lane" style={{ top: l.index * rowH, height: rowH }}>
              {l.label}
            </div>
          ))}
      </div>

      <div ref={gridRef} className="pr-grid" onMouseDown={(e) => toggle(e.clientX, e.clientY)}>
        {ready && (
          <>
            {lanes.map((l) => (
              <div
                key={`row-${l.id}`}
                className={`pr-row in-scale${l.index % 2 ? " alt" : ""}`}
                style={{ top: l.index * rowH, height: rowH, width: size.w }}
              />
            ))}
            {lanes.map((l) => (
              <div
                key={`rl-${l.id}`}
                className="pr-rowline"
                style={{ top: (l.index + 1) * rowH - 1, width: size.w }}
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

            {/* Prior drum layers (read-only) */}
            {drumContext.flatMap((layer, li) => {
              const color = getRole(layer.roleId)?.color ?? "#888";
              return layer.notes.map((n, ni) => cell(n.pitch, n.start, color, true, `ctx-${li}-${ni}`));
            })}

            {/* Local draft */}
            {draft.map((n, i) => cell(n.pitch, n.start, role.color, false, `hit-${i}`))}
          </>
        )}
      </div>
    </div>
  );
}
