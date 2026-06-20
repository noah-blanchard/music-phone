"use client";

import { useState } from "react";
import { SCALE_LABELS, getRole, loopSteps, noteLabel, type Layer } from "@musicphone/shared";
import { useGameStore } from "@/store/game-store";
import { PianoRollEditor } from "@/components/editors/PianoRollEditor";
import { DrumGridEditor } from "@/components/editors/DrumGridEditor";
import { TransportControls } from "@/components/TransportControls";
import { RoundTimer } from "@/components/RoundTimer";
import { RoundOverlay } from "@/components/RoundOverlay";
import { getInstrumentLabel } from "@/lib/audio/instruments";
import { getDrumKitLabel } from "@/lib/audio/drums";
import { uiClick, uiConfirm } from "@/lib/audio/sfx";

const CONTEXT_HINT: Record<string, string> = {
  previous: "You can see & hear the previous layer.",
  all: "You can see & hear everything so far.",
  blind: "You're going in blind — no preview of the other layers.",
};

const noop = () => {};

/** Active turn: add your kit's layer over the shared loop, with prior layers as context. */
export function Play() {
  const snapshot = useGameStore((s) => s.snapshot)!;
  const contextLayers = useGameStore((s) => s.contextLayers);
  const currentRole = useGameStore((s) => s.currentRole);
  const currentSong = useGameStore((s) => s.currentSong);
  const selectedInstrument = useGameStore((s) => s.selectedInstrument);
  const rerollsLeft = useGameStore((s) => s.rerollsLeft);
  const rerollInstrument = useGameStore((s) => s.rerollInstrument);
  const pitchUnlocked = useGameStore((s) => s.pitchUnlocked);
  const setPitchUnlocked = useGameStore((s) => s.setPitchUnlocked);
  const submitted = useGameStore((s) => s.submitted);
  const draft = useGameStore((s) => s.draft);
  const setDraft = useGameStore((s) => s.setDraft);
  const clearDraft = useGameStore((s) => s.clearDraft);
  const submitTurn = useGameStore((s) => s.submitTurn);

  const [playStep, setPlayStep] = useState<number | null>(null);

  const { config } = snapshot;
  const readyCount = snapshot.players.filter((p) => snapshot.ready[p.id]).length;

  const role = currentRole ?? getRole(snapshot.assignments[snapshot.selfId]);
  if (!role || !currentSong) return <div className="center muted">Dealing your kit…</div>;

  const isDrum = role.editor === "drum-grid";
  const hasMelodicCtx = contextLayers.some((l) => getRole(l.roleId)?.editor === "piano-roll");
  const hasDrumCtx = contextLayers.some((l) => getRole(l.roleId)?.editor === "drum-grid");
  const showPiano = !isDrum || hasMelodicCtx;
  const showDrums = isDrum || hasDrumCtx;

  const totalSteps = loopSteps(config);
  const playLayersList: Layer[] = [...contextLayers, { roleId: role.id, instrumentId: selectedInstrument, notes: draft }];
  const soundLabel = isDrum ? getDrumKitLabel(selectedInstrument) : getInstrumentLabel(selectedInstrument);

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
            Your kit · <span style={{ color: role.color }}>{role.name}</span>
          </h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {noteLabel(currentSong.root).replace(/\d+$/, "")} {SCALE_LABELS[currentSong.scale]} ·{" "}
            {currentSong.bpm} BPM · {config.barsPerSong}-bar loop · {CONTEXT_HINT[config.contextVisibility]}
          </span>
        </div>

        <div className={`stage-panes${showPiano ? "" : " solo"}`}>
          {showPiano && (
            <div className="screen pane-piano">
              <PianoRollEditor
                config={config}
                role={role}
                songRoot={currentSong.root}
                songScale={currentSong.scale}
                instrumentId={selectedInstrument}
                unlocked={pitchUnlocked}
                draft={isDrum ? [] : draft}
                contextLayers={contextLayers}
                onChange={isDrum ? noop : setDraft}
                playStep={playStep}
                readOnly={isDrum}
              />
            </div>
          )}
          {showDrums && (
            <div className="screen pane-drums">
              <DrumGridEditor
                config={config}
                role={role}
                instrumentId={selectedInstrument}
                draft={isDrum ? draft : []}
                contextLayers={contextLayers}
                onChange={isDrum ? setDraft : noop}
                playStep={playStep}
                readOnly={!isDrum}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="dock">
        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="dock-label">Sound</span>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip" style={{ ["--sc" as string]: role.color, borderColor: role.color }}>
              {soundLabel}
            </span>
            <button
              className="hw-btn hw-btn--ghost"
              disabled={rerollsLeft <= 0}
              onClick={() => {
                uiClick();
                rerollInstrument();
              }}
              title="Reroll the sound (once)"
            >
              🎲 Reroll ({rerollsLeft})
            </button>
          </div>
        </div>

        <div className="dock-group" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <span className="dock-label">Transport</span>
          <div className="row">
            <TransportControls
              bpm={currentSong.bpm}
              totalSteps={totalSteps}
              layers={playLayersList}
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
            {!isDrum && (
              <button
                className={`hw-btn ${pitchUnlocked ? "hw-btn--danger" : "hw-btn--ghost"}`}
                onClick={() => {
                  uiClick();
                  setPitchUnlocked(!pitchUnlocked);
                }}
                title={pitchUnlocked ? "Restrict to scale" : "Allow any note (out of scale)"}
              >
                {pitchUnlocked ? "🔓 Chromatic" : "🔒 Scale"}
              </button>
            )}
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
            {submitted ? "✓ Submitted — update" : "Submit layer"}
          </button>
        </div>
      </footer>
    </div>
  );
}
