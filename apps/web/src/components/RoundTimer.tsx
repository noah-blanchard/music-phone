"use client";

import { useEffect, useState } from "react";

interface Props {
  endsAt: number;
}

/** Live countdown to the round's auto-advance time. */
export function RoundTimer({ endsAt }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const low = remaining <= 15;

  return (
    <span className={`timer${low ? " timer-low" : ""}`}>
      {mm}:{ss}
    </span>
  );
}
