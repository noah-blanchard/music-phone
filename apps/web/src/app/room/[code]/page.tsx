"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGameStore } from "@/store/game-store";
import { joinRoom } from "@/lib/eden";
import { loadCredentials, rememberCredentials, savedNickname } from "@/lib/session";
import { Lobby } from "@/components/views/Lobby";
import { Play } from "@/components/views/Play";
import { ResultsPlayer } from "@/components/ResultsPlayer";

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
      <div className="card stack" style={{ width: 360 }}>
        <h2>
          Join room <span className="code-pill">{code}</span>
        </h2>
        <label className="field">
          <span>Nickname</span>
          <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <button className="btn primary" disabled={busy} onClick={join}>
          Join
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function RoomConnected({ code, playerId }: { code: string; playerId: string }) {
  const connect = useGameStore((s) => s.connect);
  const disconnect = useGameStore((s) => s.disconnect);
  const snapshot = useGameStore((s) => s.snapshot);
  const connected = useGameStore((s) => s.connected);

  useEffect(() => {
    connect(code, playerId);
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, playerId]);

  if (!snapshot) {
    return <div className="center muted">{connected ? "Loading room…" : "Connecting…"}</div>;
  }

  switch (snapshot.phase) {
    case "lobby":
      return <Lobby />;
    case "playing":
      return <Play />;
    case "results":
      return (
        <div className="page stack">
          <h1 className="brand">
            Music<span>Phone</span> · results
          </h1>
          <div className="card">
            <ResultsPlayer
              melodies={snapshot.melodies}
              config={snapshot.config}
              roomCode={snapshot.code}
            />
          </div>
        </div>
      );
  }
}
