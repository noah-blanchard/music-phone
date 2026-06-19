"use client";

import { useState } from "react";
import { stepsPerTurn } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { PianoRoll } from "@/components/PianoRoll";
import { NotePalette } from "@/components/NotePalette";
import { TransportControls } from "@/components/TransportControls";
import { RoundTimer } from "@/components/RoundTimer";
import { RoundOverlay } from "@/components/RoundOverlay";
import { uiClick, uiConfirm } from "@/lib/audio/sfx";

/** Active turn: edit 4 measures continuing the previous player's last measure. */
export function Play() {
  const snapshot = useGameStore((s) => s.snapshot)!;
  const contextNotes = useGameStore((s) => s.contextNotes);
  const draft = useGameStore((s) => s.draft);
  const selectedTimbre = useGameStore((s) => s.selectedTimbre);
  const setDraft = useGameStore((s) => s.setDraft);
  const clearDraft = useGameStore((s) => s.clearDraft);
  const setTimbre = useGameStore((s) => s.setTimbre);
  const submitTurn = useGameStore((s) => s.submitTurn);

  const [playStep, setPlayStep] = useState<number | null>(null);

  const { config } = snapshot;
  const totalSteps = stepsPerTurn(config);
  const submitted = !!snapshot.ready[snapshot.selfId];
  const readyCount = snapshot.players.filter((p) => snapshot.ready[p.id]).length;
  const isFirstRound = snapshot.round === 0;

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
          <h2>
            {isFirstRound && contextNotes.length === 0
              ? "Start a fresh melody"
              : "Continue the melody"}
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>
            The cyan measure on the left is what you were handed — write the next 4.
          </span>
        </div>

        <div className="screen stage-screen">
          <PianoRoll
            config={config}
            draft={draft}
            contextNotes={contextNotes}
            selectedTimbre={selectedTimbre}
            onChange={setDraft}
            playStep={playStep}
          />
        </div>
      </main>

      <footer className="dock">
        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="dock-label">Timbre</span>
          <NotePalette selected={selectedTimbre} onSelect={setTimbre} />
        </div>

        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="dock-label">Transport</span>
          <div className="row">
            <TransportControls
              notes={draft}
              config={config}
              totalSteps={totalSteps}
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
            {submitted ? "✓ Submitted — update" : "Submit melody"}
          </button>
        </div>
      </footer>
    </div>
  );
}
