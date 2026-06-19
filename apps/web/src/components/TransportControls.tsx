"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig, Note } from "@musicphone/shared";
import { ensureAudio, playNotes, type PlayHandle } from "@/lib/audio/engine";

interface Props {
  notes: Note[];
  config: GameConfig;
  totalSteps: number;
  onStep?: (step: number | null) => void;
}

/** Play/stop the current draft locally through Tone.js (hardware button). */
export function TransportControls({ notes, config, totalSteps, onStep }: Props) {
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
    onStep?.(null);
  };

  const play = async () => {
    await ensureAudio();
    if (playing) {
      stop();
      return;
    }
    setPlaying(true);
    handleRef.current = playNotes(notes, config.bpm, totalSteps, {
      onStep: (s) => onStep?.(s),
      onEnd: stop,
    });
  };

  useEffect(() => () => handleRef.current?.stop(), []);

  return (
    <button
      type="button"
      className={`hw-btn hw-icon${playing ? "" : " hw-btn--primary"}`}
      onClick={play}
      disabled={notes.length === 0 && !playing}
      title={playing ? "Stop" : "Play"}
    >
      {playing ? "■" : "▶"}
    </button>
  );
}
