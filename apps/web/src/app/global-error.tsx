"use client";

import { useEffect } from "react";

/**
 * Last resort: an error in the root layout itself, where `error.tsx` cannot
 * help because the layout that would render it is the thing that failed. It
 * must therefore supply its own <html> and <body>, and cannot rely on the app's
 * stylesheet having loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0a0b0e",
          color: "#e7e9ee",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>MusicPhone hit a fatal error</h1>
          <p style={{ opacity: 0.7, marginBottom: 20, fontSize: 14 }}>
            Reloading should bring it back.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #3a3d47",
              background: "#1b1d23",
              color: "inherit",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
