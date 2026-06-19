"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  display?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/** Vintage rotary knob. Drag vertically to change the value. */
export function Knob({ value, min, max, step = 1, label, display, disabled, onChange }: Props) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, v: value });

  const angle = (-135 + ((value - min) / (max - min)) * 270).toFixed(1) + "deg";

  const onMove = useCallback(
    (e: MouseEvent) => {
      const dy = startRef.current.y - e.clientY; // up = increase
      const range = max - min;
      let next = startRef.current.v + (dy / 150) * range;
      next = Math.round(next / step) * step;
      next = Math.min(max, Math.max(min, next));
      onChange(next);
    },
    [max, min, step, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, onMove]);

  return (
    <div className="field" style={{ alignItems: "center", opacity: disabled ? 0.5 : 1 }}>
      <span>{label}</span>
      <div
        className="knob"
        style={{ ["--angle" as string]: angle }}
        onMouseDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          startRef.current = { y: e.clientY, v: value };
          setDragging(true);
        }}
      />
      <span className="led" style={{ fontSize: 14 }}>
        {display ?? value}
      </span>
    </div>
  );
}
