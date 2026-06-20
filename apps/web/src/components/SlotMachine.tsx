"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BPM_CHOICES, KEY_CHOICES, SCALE_CHOICES, SCALE_LABELS, noteLabel } from "@musicphone/shared";

interface Props {
  song: { bpm: number; root: number; scale: (typeof SCALE_CHOICES)[number] };
  onDone: () => void;
}

const ITEM_H = 58;
const PASSES = 6; // full pool spins before landing

const keyName = (p: number) => noteLabel(p).replace(/\d+$/, "");

/** One vertical reel that spins down and snaps to `targetIndex` in `items`. */
function Reel({
  label,
  items,
  targetIndex,
  delay,
  reduce,
}: {
  label: string;
  items: string[];
  targetIndex: number;
  delay: number;
  reduce: boolean;
}) {
  // Repeat the pool so the strip can spin several times before landing.
  const strip = reduce ? items : Array.from({ length: PASSES + 1 }).flatMap(() => items);
  const landIndex = reduce ? targetIndex : PASSES * items.length + targetIndex;
  const finalY = -landIndex * ITEM_H;

  return (
    <div className="slot-reel">
      <span className="slot-label">{label}</span>
      <div className="slot-window" style={{ height: ITEM_H }}>
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: finalY }}
          transition={{ duration: reduce ? 0 : 1.6, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
        >
          {strip.map((v, i) => (
            <div key={i} className="slot-item" style={{ height: ITEM_H }}>
              {v}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Jackpot reveal of a song's BPM / key / scale. Three reels scroll and snap one
 * after another to the (server-rolled) values for the local player's song.
 */
export function SlotMachine({ song, onDone }: Props) {
  const reduce = !!useReducedMotion();

  useEffect(() => {
    const total = reduce ? 600 : 1600 + 2 * 500 + 900; // last reel delay + spin + hold
    const t = setTimeout(onDone, total);
    return () => clearTimeout(t);
  }, [reduce, onDone]);

  return (
    <div className="slot-wrap">
      <div className="wheel-title">Rolling your song…</div>
      <div className="slot-machine panel">
        <Reel
          label="BPM"
          items={BPM_CHOICES.map(String)}
          targetIndex={Math.max(0, BPM_CHOICES.indexOf(song.bpm))}
          delay={0}
          reduce={reduce}
        />
        <Reel
          label="KEY"
          items={KEY_CHOICES.map(keyName)}
          targetIndex={Math.max(0, KEY_CHOICES.indexOf(song.root))}
          delay={0.5}
          reduce={reduce}
        />
        <Reel
          label="SCALE"
          items={SCALE_CHOICES.map((s) => SCALE_LABELS[s])}
          targetIndex={Math.max(0, SCALE_CHOICES.indexOf(song.scale))}
          delay={1.0}
          reduce={reduce}
        />
      </div>
    </div>
  );
}
