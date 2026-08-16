"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGameStore } from "@/store/game-store";
import { joinRoom } from "@/lib/eden";
import { loadCredentials, rememberCredentials, savedNickname } from "@/lib/session";
import { Lobby } from "@/components/views/Lobby";
import { Play } from "@/components/views/Play";
import { ResultsPlayer } from "@/components/ResultsPlayer";
import { ConnectionStatus } from "@/components/ConnectionStatus";

export default function RoomPage() {
  const params = useParams();
  const code = ((Array.isArray(params.code) ? params.code[0] : params.code) ?? "").toUpperCase();

  const [playerId, setPlayerId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setPlayerId(loadCredentials(code));
    setChecked(true);
  }, [code]);

  if (!checked) return <div className="center muted">Loading…</div>;
  if (!playerId) return <JoinGate code={code} onJoined={setPlayerId} />;
  return <RoomConnected code={code} playerId={playerId} />;
}

function JoinGate({ code, onJoined }: { code: string; onJoined: (id: string) => void }) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNickname(savedNickname()), []);

  const join = async () => {
    if (!nickname.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const creds = await joinRoom(code, nickname.trim());
      rememberCredentials(creds.code, creds.playerId);
      onJoined(creds.playerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="panel stack" style={{ width: 360 }}>
        <h2>
          Join room <span className="code-pill">{code}</span>
        </h2>
        <label className="field">
          <span>Nickname</span>
          <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <button className="hw-btn hw-btn--primary" disabled={busy} onClick={join}>
          Join
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function RoomConnected({ code, playerId }: { code: string; playerId: string }) {
  // `connect` and `disconnect` are stable zustand actions, so this effect runs
  // once per room/player rather than on every store change.
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);
  const snapshot = useGameStore((s) => s.snapshot);
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);

  useEffect(() => {
    connect(code, playerId);
    return () => disconnect();
  }, [code, playerId, connect, disconnect]);

  // Nothing to show yet: either still arriving, or the room is gone for good.
  if (!snapshot) {
    if (status === "ended") {
      return (
        <div className="center">
          <div className="panel stack" style={{ width: 380, textAlign: "center" }}>
            <h2>This room has ended</h2>
            <p className="muted">
              {error ??
                "The game is no longer running. It may have finished, or the server restarted."}
            </p>
            <a className="hw-btn hw-btn--primary" href="/">
              Back to the start
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className="center muted">
        {status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
      </div>
    );
  }

  return (
    <>
      <ConnectionStatus />
      {snapshot.phase === "lobby" && <Lobby />}
      {snapshot.phase === "playing" && <Play />}
      {snapshot.phase === "results" && (
        <ResultsPlayer
          melodies={snapshot.melodies}
          config={snapshot.config}
          roomCode={snapshot.code}
        />
      )}
    </>
  );
}
