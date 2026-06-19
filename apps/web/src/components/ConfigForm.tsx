"use client";

import { SCALE_LABELS, noteLabel, type GameConfig, type ScaleType } from "@musicphone/shared";
import { Knob } from "@/components/Knob";

interface Props {
  config: GameConfig;
  editable: boolean;
  onChange: (patch: Partial<GameConfig>) => void;
}

const ROOT_CHOICES = Array.from({ length: 12 }, (_, i) => 60 + i); // C4..B4
const SCALES: ScaleType[] = ["major", "minor", "pentatonic"];
const DURATIONS = [60, 120, 180, 300];

/** Host-editable game settings, styled as console controls. */
export function ConfigForm({ config, editable, onChange }: Props) {
  return (
    <div className="config-grid">
      <Knob
        label="Tempo"
        value={config.bpm}
        min={60}
        max={180}
        display={`${config.bpm} BPM`}
        disabled={!editable}
        onChange={(bpm) => onChange({ bpm })}
      />

      <label className="field">
        <span>Root</span>
        <select
          className="input"
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
          className="input"
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
        <span>Round time</span>
        <select
          className="input"
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
