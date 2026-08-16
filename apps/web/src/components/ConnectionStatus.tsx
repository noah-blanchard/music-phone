"use client";

import { useGameStore } from "@/store/game-store";

/**
 * Tells the player what the connection is doing.
 *
 * A dropped socket used to be invisible: the game simply stopped responding
 * while the client retried in the background, so the natural conclusion was
 * that it had broken. Saying "reconnecting" costs nothing and answers the
 * question before it is asked.
 */
export function ConnectionStatus() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const dismissError = useGameStore((s) => s.dismissError);

  if (status === "ended") {
    return (
      <div className="conn conn--ended" role="alert">
        <span>{error ?? "Disconnected."}</span>
        <button className="hw-btn hw-btn--ghost" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div className="conn conn--warn" role="status">
        <span className="conn-dot" />
        Reconnecting… your work is saved.
      </div>
    );
  }

  // Online, but something went wrong — a refused action, say. Dismissable, so
  // it cannot linger on screen for the rest of the game.
  if (error) {
    return (
      <div className="conn conn--warn" role="alert">
        <span>{error}</span>
        <button className="hw-btn hw-btn--ghost" onClick={dismissError} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }

  return null;
}
