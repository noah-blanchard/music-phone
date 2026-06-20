"use client";

import {
  LAYER_ROLES,
  MAX_BARS_PER_SONG,
  MIN_BARS_PER_SONG,
  type ContextVisibility,
  type GameConfig,
} from "@musicphone/shared";
import { Knob } from "@/components/Knob";

interface Props {
  config: GameConfig;
  editable: boolean;
  /** Number of players in the room (roles must be >= this to start). */
  playerCount: number;
  onChange: (patch: Partial<GameConfig>) => void;
}

const DURATIONS = [60, 120, 180, 300];
const VISIBILITY: { value: ContextVisibility; label: string }[] = [
  { value: "previous", label: "Previous layer" },
  { value: "all", label: "Everything so far" },
  { value: "blind", label: "Blind" },
];

/**
 * Host-editable game settings. BPM/key/scale are no longer here — they are
 * rolled per song at game start. Instead the host picks which layer kinds are in
 * play (the wheel deals one to each player).
 */
export function ConfigForm({ config, editable, playerCount, onChange }: Props) {
  const selected = new Set(config.selectedRoles);

  const toggleRole = (id: string) => {
    if (!editable) return;
    const next = LAYER_ROLES.map((r) => r.id).filter((rid) =>
      rid === id ? !selected.has(id) : selected.has(rid),
    );
    onChange({ selectedRoles: next });
  };

  const enough = config.selectedRoles.length >= playerCount;

  return (
    <div className="config-stack">
      <div className="roles-pick">
        <div className="spread">
          <span className="dock-label">Layer kinds in play</span>
          <span className={`led ${enough ? "led-dim" : ""}`} style={{ fontSize: 11, color: enough ? undefined : "var(--danger)" }}>
            {config.selectedRoles.length}/{playerCount} min
          </span>
        </div>
        <div className="role-chips">
          {LAYER_ROLES.map((r) => {
            const on = selected.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                className={`role-chip${on ? " on" : ""}`}
                style={{ ["--tc" as string]: r.color }}
                disabled={!editable}
                onClick={() => toggleRole(r.id)}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="config-grid">
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
    </div>
  );
}
