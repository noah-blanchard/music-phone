"use client";

import { useEffect } from "react";

/**
 * Catches render and effect errors anywhere below the root layout.
 *
 * Without this, one thrown error left a blank white page with no way out —
 * which for a party game means everyone in the room is simply stuck.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="center">
      <div className="panel stack" style={{ width: 400, textAlign: "center" }}>
        <h2>Something went wrong</h2>
        <p className="muted">
          The app hit an unexpected error. Trying again usually works — your room is still running.
        </p>
        <button className="hw-btn hw-btn--primary" onClick={reset}>
          Try again
        </button>
        <a className="muted" href="/" style={{ fontSize: 12 }}>
          Back to the start
        </a>
      </div>
    </div>
  );
}
