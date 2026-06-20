"use client";

import { motion } from "motion/react";
import { MAX_PLAYERS, MIN_PLAYERS } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { ConfigForm } from "@/components/ConfigForm";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { uiConfirm } from "@/lib/audio/sfx";

/** Pre-game "mixing console": share code, host tweaks settings, START. */
export function Lobby() {
  const snapshot = useGameStore((s) => s.snapshot)!;
  const startGame = useGameStore((s) => s.startGame);
  const updateConfig = useGameStore((s) => s.updateConfig);
  const error = useGameStore((s) => s.error);

  const isHost = snapshot.selfId === snapshot.hostId;
  const playerCount = snapshot.players.length;
  const enoughPlayers = playerCount >= MIN_PLAYERS;
  const enoughRoles = snapshot.config.selectedRoles.length >= playerCount;
  const canStart = enoughPlayers && enoughRoles;
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => snapshot.players[i] ?? null);

  return (
    <div className="center">
      <motion.div
        className="panel console"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="console-head">
          <div>
            <h1 className="logo" style={{ fontSize: 26, textAlign: "left" }}>
              Music<span className="accent">Phone</span>
            </h1>
            <p className="muted" style={{ fontSize: 12 }}>
              Share the code · {MIN_PLAYERS}–{MAX_PLAYERS} players
            </p>
          </div>
          <div className="code-led">{snapshot.code}</div>
        </div>

        <div className="strips">
          {slots.map((p, i) => (
            <motion.div
              key={p?.id ?? `empty-${i}`}
              className={`strip-ch${p ? "" : " empty"}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
            >
              {p ? (
                <>
                  <PlayerAvatar id={p.id} name={p.name} dim={!p.connected} />
                  <span className="strip-name">
                    {p.name}
                    {p.id === snapshot.selfId && " (you)"}
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="led-dot" data-on={p.connected} />
                    {p.id === snapshot.hostId && <span className="chip">host</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="avatar" style={{ width: 44, height: 44, background: "#2a2d35" }} />
                  <span className="strip-name muted">open</span>
                </>
              )}
            </motion.div>
          ))}
        </div>

        <div className="divider" />

        <ConfigForm
          config={snapshot.config}
          editable={isHost}
          playerCount={playerCount}
          onChange={updateConfig}
        />

        <div className="spread" style={{ marginTop: 22 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {isHost ? "You are the host" : "Waiting for the host…"}
          </span>
          {isHost && (
            <button
              className="hw-btn hw-btn--primary"
              style={{ padding: "14px 26px", fontSize: 15 }}
              disabled={!canStart}
              onClick={() => {
                uiConfirm();
                startGame();
              }}
            >
              {!enoughPlayers
                ? `Need ${MIN_PLAYERS - playerCount} more`
                : !enoughRoles
                  ? `Pick ${playerCount - snapshot.config.selectedRoles.length} more kit(s)`
                  : "▶ Start game"}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </motion.div>
    </div>
  );
}
