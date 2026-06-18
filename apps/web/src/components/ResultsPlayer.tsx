"use client";

import { useEffect, useRef, useState } from "react";
import type { GameConfig, Melody } from "@musicphone/shared";
import { ensureAudio, playNotes, type PlayHandle } from "@/lib/audio/engine";
import { flattenMelody, melodySteps } from "@/lib/audio/schedule";

interface Props {
  melodies: Melody[];
  config: GameConfig;
  roomCode: string;
}

// Stable palette so each author keeps the same colour across a melody strip.
const AUTHOR_COLORS = ["#4f9dde", "#39b58a", "#e0913a", "#c2569e", "#8b6fd6", "#d65656", "#3aa6a6", "#9aa53a"];

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
    if (playingId === melody.id) {
      stop();
      return;
    }
    handleRef.current?.stop();
    setPlayingId(melody.id);
    handleRef.current = playNotes(
      flattenMelody(melody, config),
      config.bpm,
      melodySteps(melody, config),
      { onEnd: stop },
    );
  };

  useEffect(() => () => handleRef.current?.stop(), []);

  const exportJson = () => {
    const payload = { code: roomCode, config, melodies, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `musicphone-${roomCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Map authorId -> colour for consistent strip colours.
  const authorColor = new Map<string, string>();
  let ci = 0;
  for (const m of melodies) {
    for (const s of m.segments) {
      if (!authorColor.has(s.authorId)) {
        authorColor.set(s.authorId, AUTHOR_COLORS[ci % AUTHOR_COLORS.length]!);
        ci++;
      }
    }
  }

  return (
    <div className="results">
      <div className="results-head">
        <h2>Finished melodies</h2>
        <button type="button" className="btn" onClick={exportJson}>
          ⤓ Export JSON
        </button>
      </div>

      {melodies.map((melody, i) => (
        <div key={melody.id} className="result-row">
          <button
            type="button"
            className="btn play"
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
                style={{ background: authorColor.get(seg.authorId) }}
                title={`${seg.authorName} — ${seg.notes.length} notes`}
              >
                {seg.authorName}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
