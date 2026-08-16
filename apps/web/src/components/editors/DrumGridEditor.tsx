"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getRole,
  loopSteps,
  type GameConfig,
  type Layer,
  type Note,
  type Role,
} from "@musicphone/shared";
import { DRUM_LANES } from "@/lib/audio/drums";
import { ensureAudio, previewDrum } from "@/lib/audio/engine";
import type { Playhead } from "@/lib/playhead";

const GUTTER_W = 150; // wide enough for the lane label + fill buttons
const LANE_H = 30; // fixed, compact lanes (the strip does not stretch to fill)

/** Fill intervals (in 16th steps) offered per lane. */
const FILLS: { label: string; step: number }[] = [
  { label: "1/4", step: 4 },
  { label: "1/8", step: 2 },
  { label: "1/16", step: 1 },
  { label: "1/2", step: 8 },
];

interface Props {
  config: GameConfig;
  role: Role;
  /** Selected drum kit id, used for placement preview. */
  instrumentId: string;
  draft: Note[];
  contextLayers: Layer[];
  onChange: (notes: Note[]) => void;
  /** Transport position, delivered outside React so playback cannot re-render. */
  playhead: Playhead;
  /** Read-only context view (no editing, no fill controls). */
  readOnly?: boolean;
}

/**
 * Compact FL-Studio-style step sequencer. Rows are the kit lanes
 * (`DRUM_LANES`, index = note pitch); lanes have a fixed height so the strip
 * stays short and scannable. Each lane has quick-fill buttons. Prior drum layers
 * show faintly behind the grid.
 */
export function DrumGridEditor({
  config,
  role,
  instrumentId,
  draft,
  contextLayers,
  onChange,
  playhead,
  readOnly,
}: Props) {
  const lanes = DRUM_LANES;
  const editSteps = loopSteps(config);
  const rows = lanes.length;
  const gridH = rows * LANE_H;

  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [gridW, setGridW] = useState(0);
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

  const toggle = useCallback(
    (clientX: number, clientY: number) => {
      if (readOnly) return;
      const el = gridRef.current;
      if (!el || cellW <= 0) return;
      const rect = el.getBoundingClientRect();
      const step = Math.floor((clientX - rect.left) / cellW);
      const lane = Math.floor((clientY - rect.top) / LANE_H);
      if (lane < 0 || lane >= rows || step < 0 || step >= editSteps) return;

      const existing = draftRef.current.find((n) => n.pitch === lane && n.start === step);
      if (existing) {
        onChange(draftRef.current.filter((n) => n !== existing));
        return;
      }
      onChange([...draftRef.current, { pitch: lane, start: step, length: 1 }]);
      void ensureAudio().then(() => previewDrum(instrumentId, lane));
    },
    [cellW, rows, editSteps, onChange, instrumentId, readOnly],
  );

  const fillLane = (lane: number, interval: number) => {
    const others = draftRef.current.filter((n) => n.pitch !== lane);
    const hits: Note[] = [];
    for (let s = 0; s < editSteps; s += interval) hits.push({ pitch: lane, start: s, length: 1 });
    onChange([...others, ...hits]);
    void ensureAudio().then(() => previewDrum(instrumentId, lane));
  };
  const clearLane = (lane: number) => onChange(draftRef.current.filter((n) => n.pitch !== lane));

  const drumContext = useMemo(
    () => contextLayers.filter((l) => getRole(l.roleId)?.editor === "drum-grid"),
    [contextLayers],
  );

  const ready = cellW > 0;

  // Same as the piano roll: the bar and the hit flashes are DOM writes, not
  // renders, so playback costs nothing while the player is editing.
  useEffect(() => {
    if (cellW <= 0) return;
    return playhead.subscribe((step) => {
      const playing = step != null && step >= 0;

      const bar = playheadRef.current;
      if (bar) {
        bar.classList.toggle("off", !playing);
        if (playing) bar.style.transform = `translateX(${step * cellW}px)`;
      }

      gridRef.current?.querySelectorAll<HTMLElement>(".dg-hit:not(.dg-ctx)").forEach((el) => {
        el.classList.toggle("flash", playing && Number(el.dataset.step) === step);
      });
    });
  }, [playhead, cellW]);

  // Static backdrop: lanes and grid lines move only when the loop is resized.
  const backdrop = useMemo(() => {
    if (!ready) return null;
    return (
      <>
        {lanes.map((l) => (
          <div
            key={`row-${l.id}`}
            className={`pr-row in-scale${l.index % 2 ? " alt" : ""}`}
            style={{ top: l.index * LANE_H, height: LANE_H, width: gridW }}
          />
        ))}
        {lanes.map((l) => (
          <div
            key={`rl-${l.id}`}
            className="pr-rowline"
            style={{ top: (l.index + 1) * LANE_H - 1, width: gridW }}
          />
        ))}

        {Array.from({ length: editSteps + 1 }).map((_, c) => {
          const cls = c % config.stepsPerMeasure === 0 ? "measure" : c % 4 === 0 ? "beat" : "";
          return (
            <div
              key={`col-${c}`}
              className={`pr-col ${cls}`}
              style={{ left: c * cellW, height: gridH }}
            />
          );
        })}
      </>
    );
  }, [ready, lanes, gridW, cellW, gridH, editSteps, config.stepsPerMeasure]);

  const cell = (lane: number, step: number, color: string, context: boolean, key: string) => {
    return (
      <div
        key={key}
        data-step={step}
        className={`dg-hit${context ? " dg-ctx" : ""}`}
        style={{
          left: step * cellW + 1,
          top: lane * LANE_H + 1,
          width: Math.max(2, cellW - 2),
          height: LANE_H - 2,
          ["--nc" as string]: color,
        }}
      />
    );
  };

  return (
    <div className="dg" style={{ height: gridH }}>
      {/* Lane gutter: label + fill helpers */}
      <div className="dg-gutter" style={{ width: GUTTER_W }}>
        {lanes.map((l) => (
          <div key={l.id} className="dg-lane-row" style={{ height: LANE_H }}>
            <span className="dg-lane-name">{l.label}</span>
            {!readOnly && (
              <span className="dg-fills">
                {FILLS.map((f) => (
                  <button
                    key={f.step}
                    className="dg-fill"
                    title={`Every ${f.label}`}
                    onClick={() => fillLane(l.index, f.step)}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  className="dg-fill dg-clear"
                  title="Clear lane"
                  onClick={() => clearLane(l.index)}
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="dg-grid"
        // Pointer, not mouse: a tap on a tablet has to place a hit too.
        onPointerDown={(e) => {
          if (e.isPrimary) toggle(e.clientX, e.clientY);
        }}
      >
        {ready && (
          <>
            {backdrop}

            {/* Always mounted; the effect above moves and hides it. */}
            <div ref={playheadRef} className="pr-playhead off" style={{ height: gridH }} />

            {drumContext.flatMap((layer, li) => {
              const color = getRole(layer.roleId)?.color ?? "#888";
              return layer.notes.map((n, ni) =>
                cell(n.pitch, n.start, color, true, `ctx-${li}-${ni}`),
              );
            })}

            {!readOnly &&
              draft.map((n, i) => cell(n.pitch, n.start, role.color, false, `hit-${i}`))}
          </>
        )}
      </div>
    </div>
  );
}
