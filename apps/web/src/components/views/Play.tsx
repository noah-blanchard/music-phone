"use client";

import { useState } from "react";
import { stepsPerTurn } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { PianoRoll } from "@/components/PianoRoll";
import { NotePalette } from "@/components/NotePalette";
import { TransportControls } from "@/components/TransportControls";
import { RoundTimer } from "@/components/RoundTimer";
import { PlayerList } from "@/components/PlayerList";

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
    <div className="page stack">
      <div className="spread">
        <h1 className="brand">
          Music<span>Phone</span>
        </h1>
        <div className="row">
          <span className="muted">
            Round {snapshot.round + 1} / {snapshot.totalRounds}
          </span>
          <RoundTimer endsAt={snapshot.roundEndsAt} />
        </div>
      </div>

      <div className="card stack">
        <div className="spread">
          <div>
            <h2 style={{ margin: 0 }}>
              {isFirstRound && contextNotes.length === 0
                ? "Start a fresh melody"
                : "Continue from the previous measure"}
            </h2>
            <p className="muted">
              The greyed measure on the left is what you were handed — write the next 4 measures.
            </p>
          </div>
          <div className="row">
            <TransportControls
              notes={draft}
              config={config}
              totalSteps={totalSteps}
              onStep={setPlayStep}
            />
          </div>
        </div>

        <NotePalette selected={selectedTimbre} onSelect={setTimbre} onClear={clearDraft} />

        <PianoRoll
          config={config}
          draft={draft}
          contextNotes={contextNotes}
          selectedTimbre={selectedTimbre}
          onChange={setDraft}
          playStep={playStep}
        />

        <div className="spread">
          <span className="muted">
            {readyCount} / {snapshot.players.length} ready
          </span>
          <button className={`btn ${submitted ? "" : "primary"}`} onClick={submitTurn}>
            {submitted ? "✓ Submitted — update" : "Submit my 4 measures"}
          </button>
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Players</h3>
        <PlayerList
          players={snapshot.players}
          hostId={snapshot.hostId}
          selfId={snapshot.selfId}
          ready={snapshot.ready}
          showReady
        />
      </div>
    </div>
  );
}
