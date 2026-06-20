"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { createRoom, joinRoom } from "@/lib/eden";
import { rememberCredentials, rememberNickname, savedNickname } from "@/lib/session";
import { ensureAudio } from "@/lib/audio/engine";
import { uiClick, uiConfirm } from "@/lib/audio/sfx";

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setNickname(savedNickname()), []);

  const enter = async (action: "create" | "join") => {
    await ensureAudio();
    uiConfirm();
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
      <div className="title-bg">
        <div className="title-grid" />
      </div>

      <motion.div
        className="panel title-card stack"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div>
          <motion.div
            className="logo"
            initial={{ letterSpacing: "0.3em", opacity: 0 }}
            animate={{ letterSpacing: "0.06em", opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            Music<span className="accent">Phone</span>
          </motion.div>
          <p className="tagline">Build a song together — one layer at a time.</p>
        </div>

        <label className="field">
          Nickname
          <input
            className="input"
            value={nickname}
            maxLength={20}
            placeholder="e.g. Noah"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        <button
          className="hw-btn hw-btn--primary"
          style={{ width: "100%", padding: 14 }}
          disabled={busy}
          onClick={() => enter("create")}
        >
          Create a room
        </button>

        <div className="divider" />

        <label className="field">
          Room code
          <input
            className="input"
            value={code}
            maxLength={6}
            placeholder="ABCD"
            style={{ textTransform: "uppercase", letterSpacing: "0.18em" }}
            onChange={(e) => setCode(e.target.value)}
            onFocus={uiClick}
          />
        </label>
        <button
          className="hw-btn"
          style={{ width: "100%", padding: 13 }}
          disabled={busy || !code.trim()}
          onClick={() => enter("join")}
        >
          Join room
        </button>

        {error && <p className="error">{error}</p>}
      </motion.div>
    </div>
  );
}
