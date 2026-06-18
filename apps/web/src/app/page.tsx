"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom } from "@/lib/eden";
import { rememberCredentials, rememberNickname, savedNickname } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the saved nickname after mount to avoid an SSR hydration mismatch.
  useEffect(() => setNickname(savedNickname()), []);

  const enter = async (action: "create" | "join") => {
    if (!nickname.trim()) {
      setError("Pick a nickname first");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      rememberNickname(nickname.trim());
      const creds =
        action === "create"
          ? await createRoom(nickname.trim())
          : await joinRoom(code.trim().toUpperCase(), nickname.trim());
      rememberCredentials(creds.code, creds.playerId);
      router.push(`/room/${creds.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="card stack" style={{ width: 380 }}>
        <div>
          <h1 className="brand">
            Music<span>Phone</span>
          </h1>
          <p className="muted">Pass the melody around. Continue what you hear.</p>
        </div>

        <label className="field">
          <span>Nickname</span>
          <input
            value={nickname}
            maxLength={20}
            placeholder="e.g. Noah"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        <button className="btn primary" disabled={busy} onClick={() => enter("create")}>
          Create a room
        </button>

        <div className="divider" />

        <label className="field">
          <span>Room code</span>
          <input
            value={code}
            maxLength={6}
            placeholder="ABCD"
            style={{ textTransform: "uppercase", letterSpacing: "0.15em" }}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy || !code.trim()} onClick={() => enter("join")}>
          Join room
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
