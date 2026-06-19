"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig, Layer, Note } from "@musicphone/shared";
import { ensureAudio, playLayers, playNotes, type PlayHandle } from "@/lib/audio/engine";

interface Props {
  config: GameConfig;
  totalSteps: number;
  /** Continue mode: a flat per-note-timbre list. */
  notes?: Note[];
  /** Layers mode: stacked layers (each played through its role instrument). */
  layers?: Layer[];
  onStep?: (step: number | null) => void;
}

/** Play/stop the current draft locally through Tone.js (hardware button). */
export function TransportControls({ config, totalSteps, notes, layers, onStep }: Props) {
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);

  const isLayers = layers != null;
  const hasContent = isLayers ? layers.some((l) => l.notes.length > 0) : (notes?.length ?? 0) > 0;

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
    handleRef.current = isLayers
      ? playLayers(layers, config.bpm, totalSteps, { onStep: (s) => onStep?.(s), onEnd: stop })
      : playNotes(notes ?? [], config.bpm, totalSteps, { onStep: (s) => onStep?.(s), onEnd: stop });
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
