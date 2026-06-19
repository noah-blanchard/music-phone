"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { GameConfig, Melody } from "@musicphone/shared";
import { ensureAudio, playNotes, type PlayHandle } from "@/lib/audio/engine";
import { flattenMelody, melodySteps } from "@/lib/audio/schedule";
import { uiClick } from "@/lib/audio/sfx";
import { playerColor } from "@/lib/colors";

interface Props {
  melodies: Melody[];
  config: GameConfig;
  roomCode: string;
}

/** Final playback + JSON export of all finished melodies. */
export function ResultsPlayer({ melodies, config, roomCode }: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const handleRef = useRef<PlayHandle | null>(null);

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlayingId(null);
  };

  const play = async (melody: Melody) => {
    await ensureAudio();
    uiClick();
    if (playingId === melody.id) {
      stop();
      return;
    }
    handleRef.current?.stop();
    setPlayingId(melody.id);
    handleRef.current = playNotes(flattenMelody(melody, config), config.bpm, melodySteps(melody, config), {
      onEnd: stop,
    });
  };

  useEffect(() => () => handleRef.current?.stop(), []);

  const exportJson = () => {
    uiClick();
    const payload = { code: roomCode, config, melodies, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musicphone-${roomCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="center">
      <motion.div
        className="panel results"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="results-head">
          <h1 className="logo" style={{ fontSize: 24, textAlign: "left" }}>
            The <span className="accent">melodies</span>
          </h1>
          <button className="hw-btn" onClick={exportJson}>
            ⤓ Export JSON
          </button>
        </div>

        {melodies.map((melody, i) => (
          <motion.div
            key={melody.id}
            className="result-row"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.3 }}
          >
            <button
              className="hw-btn hw-icon hw-btn--primary"
              onClick={() => play(melody)}
              disabled={melody.segments.every((s) => s.notes.length === 0)}
            >
              {playingId === melody.id ? "■" : "▶"}
            </button>
            <span className="result-title">Melody {i + 1}</span>
            <div className="strip">
              {melody.segments.map((seg, si) => (
                <div
                  key={si}
                  className="strip-seg"
                  style={{ ["--sc" as string]: playerColor(seg.authorId) }}
                  title={`${seg.authorName} — ${seg.notes.length} notes`}
                >
                  {seg.authorName}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
