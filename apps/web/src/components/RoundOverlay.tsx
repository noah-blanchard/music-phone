"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useGameStore } from "@/store/game-store";
import { countdownBlip } from "@/lib/audio/sfx";

type Stage = "splash" | 3 | 2 | 1 | 0 | null;

/**
 * Cinematic round intro: a "ROUND n / N" splash, then a 3·2·1·GO countdown,
 * fired whenever the store's roundCue increments (i.e. on round:started).
 */
export function RoundOverlay() {
  const roundCue = useGameStore((s) => s.roundCue);
  const snapshot = useGameStore((s) => s.snapshot);
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>(null);

  useEffect(() => {
    if (roundCue === 0) return;
    // Compressed timeline when the user prefers reduced motion.
    const base = reduce ? 250 : 1100;
    const tick = reduce ? 120 : 700;
    const t: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => t.push(setTimeout(fn, ms));

    setStage("splash");
    at(base, () => {
      setStage(3);
      countdownBlip(3);
    });
    at(base + tick, () => {
      setStage(2);
      countdownBlip(2);
    });
    at(base + tick * 2, () => {
      setStage(1);
      countdownBlip(1);
    });
    at(base + tick * 3, () => {
      setStage(0);
      countdownBlip(0);
    });
    at(base + tick * 4, () => setStage(null));
    return () => t.forEach(clearTimeout);
  }, [roundCue, reduce]);

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
          {stage === "splash" ? (
            <motion.div
              key="splash"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.35, ease: "easeOut" }}
            >
              <div className="overlay-round">
                ROUND {round} / {total}
              </div>
              <div className="overlay-sub">♪ a melody arrives ♪</div>
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
