"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig, Layer } from "@musicphone/shared";
import { ensureAudio, playLayers, type PlayHandle } from "@/lib/audio/engine";

interface Props {
  config: GameConfig;
  totalSteps: number;
  /** Stacked layers (each played through its role instrument / kit). */
  layers: Layer[];
  onStep?: (step: number | null) => void;
}

/** Play/stop the current draft (with its context layers) through Tone.js. */
export function TransportControls({ config, totalSteps, layers, onStep }: Props) {
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);

  const hasContent = layers.some((l) => l.notes.length > 0);

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
    handleRef.current = playLayers(layers, config.bpm, totalSteps, {
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
      disabled={!hasContent && !playing}
      title={playing ? "Stop" : "Play"}
    >
      {playing ? "■" : "▶"}
    </button>
  );
}
