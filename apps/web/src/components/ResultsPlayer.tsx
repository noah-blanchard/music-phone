"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { getRole, roleOfSegment, type GameConfig, type Melody } from "@musicphone/shared";
import { ensureAudio, playLayers, type PlayHandle } from "@/lib/audio/engine";
import { loopLength, stackLayers } from "@/lib/audio/schedule";
import { uiClick } from "@/lib/audio/sfx";
import { useGameStore } from "@/store/game-store";

interface Props {
  melodies: Melody[];
  config: GameConfig;
  roomCode: string;
}

/** Final playback + JSON export of all finished songs. */
export function ResultsPlayer({ melodies, config, roomCode }: Props) {
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
            The <span className="accent">songs</span>
          </h1>
          <button className="hw-btn" onClick={exportJson}>
            ⤓ Export JSON
          </button>
        </div>

        <SequentialReveal melodies={melodies} config={config} />
      </motion.div>
    </div>
  );
}

/* ----------------------------- sequential reveal ------------------------- */

function SequentialReveal({ melodies, config }: { melodies: Melody[]; config: GameConfig }) {
  const reveal = useGameStore((s) => s.snapshot?.reveal);
  const selfId = useGameStore((s) => s.snapshot?.selfId);
  const setReveal = useGameStore((s) => s.setReveal);

  const activeSong = reveal?.activeSong ?? 0;
  const revealed = reveal?.revealedLayers ?? 0;
  const playing = reveal?.playing ?? false;
  const done = reveal?.done ?? false;

  if (done) {
    return (
      <div className="reveal-done">
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          ✓ All songs revealed — replay any of them:
        </p>
        {melodies.map((m, i) => (
          <FreeSong key={m.id} song={m} index={i} config={config} />
        ))}
      </div>
    );
  }

  const song = melodies[activeSong]!;

  return (
    <div className="reveal">
      <div className="reveal-list">
        {melodies.map((m, i) => {
          const status = i < activeSong ? "done" : i === activeSong ? "current" : "upcoming";
          return (
            <span key={m.id} className={`reveal-pill ${status}`}>
              {status === "done" ? "✓" : status === "current" ? "●" : "○"} Song {i + 1}
            </span>
          );
        })}
      </div>

      <ActiveSong
        key={song.id}
        song={song}
        index={activeSong}
        last={activeSong === melodies.length - 1}
        config={config}
        selfId={selfId}
        revealed={revealed}
        playing={playing}
        setReveal={setReveal}
      />
    </div>
  );
}

function ActiveSong({
  song,
  index,
  last,
  config,
  selfId,
  revealed,
  playing,
  setReveal,
}: {
  song: Melody;
  index: number;
  last: boolean;
  config: GameConfig;
  selfId: string | undefined;
  revealed: number;
  playing: boolean;
  setReveal: (activeSong: number, revealedLayers: number, playing: boolean) => void;
}) {
  const isPresenter = selfId === song.seedPlayerId;
  const total = song.segments.length;
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<number | null>(null);
  const handleRef = useRef<PlayHandle | null>(null);

  // Local audio follows the synced reveal state (+ local mutes).
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
      handleRef.current = playLayers(layers, config.bpm, loopLength(config), { loop: true, onStep: setStep });
    })();
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, revealed, muted, song.id, config.bpm, config.barsPerSong, config.stepsPerMeasure]);

  useEffect(() => () => handleRef.current?.stop(), []);

  const toggleMute = (i: number) =>
    setMuted((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <motion.div
      className="result-row song-reveal"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span className="result-title" style={{ width: "auto" }}>
          Song {index + 1}
        </span>
        <span className="led led-dim" style={{ fontSize: 11 }}>
          {revealed}/{total} layers{step != null ? ` · ${step + 1}` : ""}
        </span>
        {isPresenter ? (
          <span className="chip" style={{ marginLeft: "auto" }}>
            you present
          </span>
        ) : (
          <span className="chip" style={{ marginLeft: "auto" }}>
            {playing ? "● live" : "○ paused"}
          </span>
        )}
      </div>

      {isPresenter && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button
            className="hw-btn hw-icon hw-btn--primary"
            onClick={() => {
              uiClick();
              playing ? setReveal(index, revealed, false) : setReveal(index, Math.max(revealed, 1), true);
            }}
          >
            {playing ? "■" : "▶"}
          </button>
          <button className="hw-btn" onClick={() => { uiClick(); setReveal(index, Math.min(revealed + 1, total), true); }} disabled={revealed >= total}>
            Reveal next layer
          </button>
          <button className="hw-btn hw-btn--ghost" onClick={() => { uiClick(); setReveal(index + 1, 0, false); }}>
            {last ? "Finish ▸" : "Next song ▸"}
          </button>
        </div>
      )}

      <div className="strip" style={{ marginTop: 10 }}>
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

/** Free local replay of a finished song (shown after the reveal is done). */
function FreeSong({ song, index, config }: { song: Melody; index: number; config: GameConfig }) {
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
    handleRef.current = playLayers(stackLayers(song), config.bpm, loopLength(config), { loop: true });
  };
  useEffect(() => () => handleRef.current?.stop(), []);

  return (
    <div className="result-row">
      <button className="hw-btn hw-icon hw-btn--primary" onClick={play}>
        {playing ? "■" : "▶"}
      </button>
      <span className="result-title">Song {index + 1}</span>
      <div className="strip">
        {song.segments.map((seg, si) => {
          const role = roleOfSegment(seg.order, seg.roleId) ?? getRole(seg.roleId);
          return (
            <div
              key={si}
              className="strip-seg"
              style={{ ["--sc" as string]: role?.color ?? "#888" }}
              title={`${role?.name ?? "Layer"} — ${seg.authorName}`}
            >
              {role?.name ?? "Layer"} · {seg.authorName}
            </div>
          );
        })}
      </div>
    </div>
  );
}
