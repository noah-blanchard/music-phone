"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { getRole, roleOfSegment, type GameConfig, type Melody } from "@musicphone/shared";
import { ensureAudio, playLayers, playNotes, type PlayHandle } from "@/lib/audio/engine";
import { flattenMelody, loopLength, melodySteps, stackLayers } from "@/lib/audio/schedule";
import { uiClick } from "@/lib/audio/sfx";
import { playerColor } from "@/lib/colors";
import { useGameStore } from "@/store/game-store";

interface Props {
  melodies: Melody[];
  config: GameConfig;
  roomCode: string;
}

/** Final playback + JSON export of all finished songs. */
export function ResultsPlayer({ melodies, config, roomCode }: Props) {
  const isLayers = config.mode === "layers";

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
            The <span className="accent">{isLayers ? "songs" : "melodies"}</span>
          </h1>
          <button className="hw-btn" onClick={exportJson}>
            ⤓ Export JSON
          </button>
        </div>

        {melodies.map((melody, i) =>
          isLayers ? (
            <SongReveal key={melody.id} song={melody} index={i} config={config} />
          ) : (
            <ContinueRow key={melody.id} melody={melody} index={i} config={config} />
          ),
        )}
      </motion.div>
    </div>
  );
}

/* --------------------------- continue mode row --------------------------- */

function ContinueRow({ melody, index, config }: { melody: Melody; index: number; config: GameConfig }) {
  const [playing, setPlaying] = useState(false);
  const handleRef = useRef<PlayHandle | null>(null);

  const stop = () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPlaying(false);
  };

  const play = async () => {
    await ensureAudio();
    uiClick();
    if (playing) return stop();
    setPlaying(true);
    handleRef.current = playNotes(flattenMelody(melody, config), config.bpm, melodySteps(melody, config), {
      onEnd: stop,
    });
  };

  useEffect(() => () => handleRef.current?.stop(), []);

  return (
    <motion.div
      className="result-row"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + index * 0.12, duration: 0.3 }}
    >
      <button
        className="hw-btn hw-icon hw-btn--primary"
        onClick={play}
        disabled={melody.segments.every((s) => s.notes.length === 0)}
      >
        {playing ? "■" : "▶"}
      </button>
      <span className="result-title">Melody {index + 1}</span>
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
  );
}

/* ---------------------------- layers mode row ---------------------------- */

function SongReveal({ song, index, config }: { song: Melody; index: number; config: GameConfig }) {
  const reveal = useGameStore((s) => s.snapshot?.reveal?.[song.id]);
  const selfId = useGameStore((s) => s.snapshot?.selfId);
  const setReveal = useGameStore((s) => s.setReveal);

  const revealed = reveal?.revealedLayers ?? 0;
  const playing = reveal?.playing ?? false;
  const isController = selfId === song.seedPlayerId;
  const total = song.segments.length;

  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<number | null>(null);
  const handleRef = useRef<PlayHandle | null>(null);

  // Drive local audio from the synced reveal state (+ local mutes). The loop is
  // rebuilt whenever the revealed set, play state, or mutes change.
  useEffect(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setStep(null);
    if (!playing || revealed <= 0) return;

    let cancelled = false;
    void (async () => {
      await ensureAudio();
      if (cancelled) return;
      const layers = stackLayers(song, revealed).filter((_, i) => !muted.has(i));
      handleRef.current = playLayers(layers, config.bpm, loopLength(config), {
        loop: true,
        onStep: setStep,
      });
    })();

    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
    // Depend on primitives (not the song/config objects, which get fresh refs on
    // every snapshot) so an unrelated reveal toggle doesn't restart this song.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, revealed, muted, song.id, config.bpm, config.barsPerSong, config.stepsPerMeasure]);

  useEffect(() => () => handleRef.current?.stop(), []);

  const toggleMute = (i: number) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const playPause = () => {
    uiClick();
    if (playing) setReveal(song.id, revealed, false);
    else setReveal(song.id, Math.max(revealed, 1), true);
  };
  const revealNext = () => {
    uiClick();
    setReveal(song.id, Math.min(revealed + 1, total), true);
  };
  const reset = () => {
    uiClick();
    setReveal(song.id, 0, false);
  };

  return (
    <motion.div
      className="result-row song-reveal"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.15 + index * 0.12, duration: 0.3 }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        {isController ? (
          <>
            <button className="hw-btn hw-icon hw-btn--primary" onClick={playPause} title="Play / pause">
              {playing ? "■" : "▶"}
            </button>
            <button className="hw-btn" onClick={revealNext} disabled={revealed >= total}>
              Reveal next
            </button>
            <button className="hw-btn hw-btn--ghost" onClick={reset} disabled={revealed === 0}>
              Reset
            </button>
          </>
        ) : (
          <span className="chip">{playing ? "● live" : "○ paused"}</span>
        )}
        <span className="result-title">
          Song {index + 1}
          {isController && <span className="muted" style={{ fontSize: 11 }}> (you host the reveal)</span>}
        </span>
        <span className="led led-dim" style={{ fontSize: 11 }}>
          {revealed}/{total} layers{step != null ? ` · ${step + 1}` : ""}
        </span>
      </div>

      <div className="strip" style={{ marginTop: 8 }}>
        {song.segments.map((seg, si) => {
          const role = roleOfSegment(seg.order, seg.roleId) ?? getRole(seg.roleId);
          const shown = si < revealed;
          const color = shown ? role?.color ?? "#888" : "#2a2d35";
          const isMuted = muted.has(si);
          return (
            <button
              key={si}
              className={`strip-seg${shown ? "" : " hidden"}${isMuted ? " muted" : ""}`}
              style={{ ["--sc" as string]: color }}
              disabled={!shown}
              onClick={() => toggleMute(si)}
              title={shown ? `${role?.name ?? "Layer"} — ${seg.authorName}${isMuted ? " (muted)" : ""}` : "Hidden"}
            >
              {shown ? `${role?.name ?? "Layer"} · ${seg.authorName}` : "?"}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
