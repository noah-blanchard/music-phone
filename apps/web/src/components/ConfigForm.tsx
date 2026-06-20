"use client";

import {
  MAX_BARS_PER_SONG,
  MIN_BARS_PER_SONG,
  SCALE_LABELS,
  noteLabel,
  type ContextVisibility,
  type GameConfig,
  type ScaleType,
} from "@musicphone/shared";
import { Knob } from "@/components/Knob";

interface Props {
  config: GameConfig;
  editable: boolean;
  onChange: (patch: Partial<GameConfig>) => void;
}

const ROOT_CHOICES = Array.from({ length: 12 }, (_, i) => 60 + i); // C4..B4
const SCALES: ScaleType[] = ["major", "minor", "pentatonic"];
const DURATIONS = [60, 120, 180, 300];
const VISIBILITY: { value: ContextVisibility; label: string }[] = [
  { value: "previous", label: "Previous layer" },
  { value: "all", label: "Everything so far" },
  { value: "blind", label: "Blind" },
];

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

      <Knob
        label="Bars / loop"
        value={config.barsPerSong}
        min={MIN_BARS_PER_SONG}
        max={MAX_BARS_PER_SONG}
        display={`${config.barsPerSong} bars`}
        disabled={!editable}
        onChange={(barsPerSong) => onChange({ barsPerSong })}
      />

      <label className="field">
        <span>You see</span>
        <select
          className="input"
          disabled={!editable}
          value={config.contextVisibility}
          onChange={(e) => onChange({ contextVisibility: e.target.value as ContextVisibility })}
        >
          {VISIBILITY.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
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
