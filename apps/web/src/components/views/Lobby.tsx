"use client";

import { MAX_PLAYERS, MIN_PLAYERS } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { ConfigForm } from "@/components/ConfigForm";
import { PlayerList } from "@/components/PlayerList";

/** Pre-game lobby: share code, host tweaks settings, everyone waits to start. */
export function Lobby() {
  const snapshot = useGameStore((s) => s.snapshot)!;
  const startGame = useGameStore((s) => s.startGame);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const error = useGameStore((s) => s.error);

  const isHost = snapshot.selfId === snapshot.hostId;
  const enoughPlayers = snapshot.players.length >= MIN_PLAYERS;

  return (
    <div className="page stack">
      <div className="spread">
        <h1 className="brand">
          Music<span>Phone</span>
        </h1>
        <div className="row">
          <span className="muted">Room</span>
          <span className="code-pill">{snapshot.code}</span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <h2>Players ({snapshot.players.length})</h2>
          <PlayerList players={snapshot.players} hostId={snapshot.hostId} selfId={snapshot.selfId} />
          <p className="muted">
            Share the code <strong>{snapshot.code}</strong> with friends. Need {MIN_PLAYERS}–
            {MAX_PLAYERS} players.
          </p>
        </div>

        <div className="card stack">
          <h2>Settings</h2>
          <ConfigForm config={snapshot.config} editable={isHost} onChange={updateConfig} />
          {isHost ? (
            <button className="btn primary" disabled={!enoughPlayers} onClick={startGame}>
              {enoughPlayers ? "Start game" : `Waiting for ${MIN_PLAYERS - snapshot.players.length} more`}
            </button>
          ) : (
            <p className="muted">Waiting for the host to start…</p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
