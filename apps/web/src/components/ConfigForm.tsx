"use client";

import {
  SCALE_LABELS,
  noteLabel,
  type GameConfig,
  type ScaleType,
} from "@musicphone/shared";

interface Props {
  config: GameConfig;
  editable: boolean;
  onChange: (patch: Partial<GameConfig>) => void;
}

const ROOT_CHOICES = Array.from({ length: 12 }, (_, i) => 60 + i); // C4..B4
const SCALES: ScaleType[] = ["major", "minor", "pentatonic"];
const DURATIONS = [60, 120, 180, 300];

/** Host-editable game settings shown in the lobby (read-only for guests). */
export function ConfigForm({ config, editable, onChange }: Props) {
  return (
    <div className="config">
      <label className="field">
        <span>Root</span>
        <select
          disabled={!editable}
          value={config.root}
          onChange={(e) => onChange({ root: Number(e.target.value) })}
        >
          {ROOT_CHOICES.map((p) => (
            <option key={p} value={p}>
              {noteLabel(p)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Scale</span>
        <select
          disabled={!editable}
          value={config.scale}
          onChange={(e) => onChange({ scale: e.target.value as ScaleType })}
        >
          {SCALES.map((s) => (
            <option key={s} value={s}>
              {SCALE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Tempo · {config.bpm} BPM</span>
        <input
          type="range"
          min={60}
          max={180}
          step={1}
          disabled={!editable}
          value={config.bpm}
          onChange={(e) => onChange({ bpm: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Round time</span>
        <select
          disabled={!editable}
          value={config.roundDurationSec}
          onChange={(e) => onChange({ roundDurationSec: Number(e.target.value) })}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d < 60 ? `${d}s` : `${d / 60} min`}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
