"use client";

import type { Player } from "@musicphone/shared";

interface Props {
  players: Player[];
  hostId: string;
  selfId: string;
  /** Per-player ready flags (only meaningful during play). */
  ready?: Record<string, boolean>;
  showReady?: boolean;
}

/** Roster with host badge, connection state and optional ready ticks. */
export function PlayerList({ players, hostId, selfId, ready, showReady }: Props) {
  return (
    <ul className="players">
      {players.map((p) => (
        <li key={p.id} className={`player${p.connected ? "" : " player-off"}`}>
          <span className="player-dot" data-on={p.connected} />
          <span className="player-name">
            {p.name}
            {p.id === selfId && " (you)"}
          </span>
          {p.id === hostId && <span className="badge">host</span>}
          {showReady && ready?.[p.id] && <span className="badge ready">ready</span>}
        </li>
      ))}
    </ul>
  );
}
