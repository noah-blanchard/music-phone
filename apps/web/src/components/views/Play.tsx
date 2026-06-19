"use client";

import { useState } from "react";
import { LAYER_ROLES, getRole, loopSteps, stepsPerTurn, type Layer } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { PianoRoll } from "@/components/PianoRoll";
import { PianoRollEditor } from "@/components/editors/PianoRollEditor";
import { DrumGridEditor } from "@/components/editors/DrumGridEditor";
import { NotePalette } from "@/components/NotePalette";
import { TransportControls } from "@/components/TransportControls";
import { RoundTimer } from "@/components/RoundTimer";
import { RoundOverlay } from "@/components/RoundOverlay";
import { uiClick, uiConfirm } from "@/lib/audio/sfx";

const CONTEXT_HINT: Record<string, string> = {
  previous: "You can see & hear the previous player's layer.",
  all: "You can see & hear everything built so far.",
  blind: "You're going in blind — no preview of the other layers.",
};

/**
 * Active turn. `layers` mode: add one role's layer over the shared loop, with
 * prior layers as read-only context. `continue` mode: extend the melody from the
 * previous player's last measure.
 */
export function Play() {
  const snapshot = useGameStore((s) => s.snapshot)!;
  const contextNotes = useGameStore((s) => s.contextNotes);
  const contextLayers = useGameStore((s) => s.contextLayers);
  const currentRole = useGameStore((s) => s.currentRole);
  const draft = useGameStore((s) => s.draft);
  const selectedTimbre = useGameStore((s) => s.selectedTimbre);
  const setDraft = useGameStore((s) => s.setDraft);
  const clearDraft = useGameStore((s) => s.clearDraft);
  const setTimbre = useGameStore((s) => s.setTimbre);
  const submitTurn = useGameStore((s) => s.submitTurn);

  const [playStep, setPlayStep] = useState<number | null>(null);

  const { config } = snapshot;
  const isLayers = config.mode === "layers";
  const submitted = !!snapshot.ready[snapshot.selfId];
  const readyCount = snapshot.players.filter((p) => snapshot.ready[p.id]).length;

  // Layers mode resolves the role for this round (store value, with a fallback
  // for the brief window before round:started arrives on (re)connect).
  const role = isLayers ? (currentRole ?? getRole(LAYER_ROLES[snapshot.round]?.id) ?? LAYER_ROLES[0]!) : null;
  const totalSteps = isLayers ? loopSteps(config) : stepsPerTurn(config);
  const playLayersList: Layer[] = role
    ? [...contextLayers, { roleId: role.id, notes: draft }]
    : [];

  return (
    <div className="fill">
      <RoundOverlay />

      <header className="hud">
        <span className="hud-title">
          Music<span className="accent">Phone</span>
        </span>
        <div className="row" style={{ gap: 18 }}>
          <span className="led led-dim" style={{ fontSize: 13 }}>
            ROUND {snapshot.round + 1}/{snapshot.totalRounds}
          </span>
          <RoundTimer endsAt={snapshot.roundEndsAt} />
          <span className="chip">#{snapshot.code}</span>
        </div>
      </header>

      <main className="stage">
        <div className="stage-head">
          {isLayers && role ? (
            <>
              <h2>
                Add the <span style={{ color: role.color }}>{role.name}</span>
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                {CONTEXT_HINT[config.contextVisibility]} · {config.barsPerSong}-bar loop
              </span>
            </>
          ) : (
            <>
              <h2>
                {snapshot.round === 0 && contextNotes.length === 0
                  ? "Start a fresh melody"
                  : "Continue the melody"}
              </h2>
              <span className="muted" style={{ fontSize: 12 }}>
                The cyan measure on the left is what you were handed — write the next{" "}
                {config.measuresPerTurn}.
              </span>
            </>
          )}
        </div>

        <div className="screen stage-screen">
          {isLayers && role ? (
            role.editor === "drum-grid" ? (
              <DrumGridEditor
                config={config}
                role={role}
                draft={draft}
                contextLayers={contextLayers}
                onChange={setDraft}
                playStep={playStep}
              />
            ) : (
              <PianoRollEditor
                config={config}
                role={role}
                draft={draft}
                contextLayers={contextLayers}
                onChange={setDraft}
                playStep={playStep}
              />
            )
          ) : (
            <PianoRoll
              config={config}
              draft={draft}
              contextNotes={contextNotes}
              selectedTimbre={selectedTimbre}
              onChange={setDraft}
              playStep={playStep}
            />
          )}
        </div>
      </main>

      <footer className="dock">
        {isLayers && role ? (
          <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <span className="dock-label">Your part</span>
            <span className="chip" style={{ ["--sc" as string]: role.color, borderColor: role.color }}>
              {role.name}
            </span>
          </div>
        ) : (
          <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
            <span className="dock-label">Timbre</span>
            <NotePalette selected={selectedTimbre} onSelect={setTimbre} />
          </div>
        )}

        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="dock-label">Transport</span>
          <div className="row">
            <TransportControls
              config={config}
              totalSteps={totalSteps}
              notes={isLayers ? undefined : draft}
              layers={isLayers ? playLayersList : undefined}
              onStep={setPlayStep}
            />
            <button
              className="hw-btn hw-btn--ghost"
              onClick={() => {
                uiClick();
                clearDraft();
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="dock-spacer" />

        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-end" }}>
          <span className="dock-label">
            {readyCount}/{snapshot.players.length} ready
          </span>
          <button
            className={`hw-btn ${submitted ? "" : "hw-btn--primary"}`}
            onClick={() => {
              uiConfirm();
              submitTurn();
            }}
          >
            {submitted ? "✓ Submitted — update" : isLayers ? "Submit layer" : "Submit melody"}
          </button>
        </div>
      </footer>
    </div>
  );
}
