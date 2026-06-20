"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useGameStore } from "@/store/game-store";
import { countdownBlip } from "@/lib/audio/sfx";
import { WheelOfFortune } from "@/components/WheelOfFortune";
import { SlotMachine } from "@/components/SlotMachine";

type Stage = "wheel" | "slot" | "splash" | 3 | 2 | 1 | 0 | null;

/**
 * Round intro orchestrator. Round 0 runs the full ceremony — role-draft Wheel →
 * per-song Slot machine → 3·2·1 — then play. Later rounds keep the splash +
 * countdown. Fired whenever `roundCue` increments (on round:started).
 */
export function RoundOverlay() {
  const roundCue = useGameStore((s) => s.roundCue);
  const snapshot = useGameStore((s) => s.snapshot);
  const currentRole = useGameStore((s) => s.currentRole);
  const currentSong = useGameStore((s) => s.currentSong);
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const beginCountdown = useCallback(() => {
    const tick = reduce ? 120 : 700;
    const at = (ms: number, fn: () => void) => timeouts.current.push(setTimeout(fn, ms));
    setStage(3);
    countdownBlip(3);
    at(tick, () => (setStage(2), countdownBlip(2)));
    at(tick * 2, () => (setStage(1), countdownBlip(1)));
    at(tick * 3, () => (setStage(0), countdownBlip(0)));
    at(tick * 4, () => setStage(null));
  }, [reduce]);

  const hasIntro =
    !!snapshot && Object.keys(snapshot.assignments).length > 0 && !!currentSong;

  useEffect(() => {
    if (roundCue === 0 || !snapshot) return;
    clearAll();
    if (snapshot.round === 0 && hasIntro) {
      setStage("wheel"); // → slot → countdown, via child onDone callbacks
    } else {
      setStage("splash");
      timeouts.current.push(setTimeout(beginCountdown, reduce ? 250 : 1100));
    }
    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundCue]);

  if (!snapshot) return null;
  const round = snapshot.round + 1;
  const total = snapshot.totalRounds;

  return (
    <AnimatePresence>
      {stage !== null && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
        >
          {stage === "wheel" && currentSong ? (
            <WheelOfFortune
              players={snapshot.players}
              selectedRoles={snapshot.config.selectedRoles}
              assignments={snapshot.assignments}
              wheelOffsetDeg={snapshot.wheelOffsetDeg}
              selfId={snapshot.selfId}
              onDone={() => setStage("slot")}
            />
          ) : stage === "slot" && currentSong ? (
            <SlotMachine song={currentSong} onDone={beginCountdown} />
          ) : stage === "splash" ? (
            <motion.div
              key="splash"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.35, ease: "easeOut" }}
            >
              <div className="overlay-round">
                ROUND {round} / {total}
              </div>
              {currentRole && (
                <div className="overlay-sub" style={{ color: currentRole.color }}>
                  ▣ Your kit: {currentRole.name}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={stage}
              className="overlay-count"
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
            >
              {stage === 0 ? "GO" : stage}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
