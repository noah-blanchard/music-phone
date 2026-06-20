"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getRole, type Player } from "@musicphone/shared";
import { PlayerAvatar } from "@/components/PlayerAvatar";

interface Props {
  players: Player[];
  selectedRoles: string[];
  assignments: Record<string, string>;
  wheelOffsetDeg: number;
  selfId: string;
  onDone: () => void;
}

const SIZE = 360;
const C = SIZE / 2;
const WHEEL_R = 132;
const AVATAR_R = 158;
const LABEL_R = WHEEL_R * 0.66;
const SPINS = 5;

/** Point on a circle, angle measured clockwise from the top (12 o'clock). */
function onCircle(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

/** Short kit name for the wheel face ("Lead Kit" → "Lead"). */
function shortName(id: string) {
  return (getRole(id)?.name ?? id).replace(/\s*Kit$/, "");
}

/**
 * The kit draft: a hardware selector dial of role-coloured sectors (each
 * labelled with its kit name) and every player's avatar pinned around the rim.
 * The dial spins to the server's `wheelOffsetDeg`; when it stops, each avatar
 * reveals the kit it landed on.
 */
export function WheelOfFortune({ players, selectedRoles, assignments, wheelOffsetDeg, selfId, onDone }: Props) {
  const reduce = !!useReducedMotion();
  const [settled, setSettled] = useState(reduce);
  const m = Math.max(1, selectedRoles.length);
  const sectionDeg = 360 / m;

  useEffect(() => {
    const spinMs = reduce ? 0 : 3800;
    const holdMs = reduce ? 600 : 1500;
    const t1 = setTimeout(() => setSettled(true), spinMs);
    const t2 = setTimeout(onDone, spinMs + holdMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduce, onDone]);

  const targetRotation = reduce ? wheelOffsetDeg : SPINS * 360 + wheelOffsetDeg;

  const wedge = (k: number) => {
    const a0 = k * sectionDeg;
    const a1 = (k + 1) * sectionDeg;
    const p0 = onCircle(a0, WHEEL_R);
    const p1 = onCircle(a1, WHEEL_R);
    const large = sectionDeg > 180 ? 1 : 0;
    return `M ${C} ${C} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${WHEEL_R} ${WHEEL_R} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
  };

  return (
    <div className="wheel-wrap">
      <div className="wheel-title">Dealing kits…</div>
      <div className="wheel-stage" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <defs>
            <radialGradient id="wheelVig" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
            </radialGradient>
            <linearGradient id="hubMetal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#33363f" />
              <stop offset="100%" stopColor="#15171c" />
            </linearGradient>
          </defs>

          {/* Spinning dial */}
          <motion.g
            initial={{ rotate: 0 }}
            animate={{ rotate: targetRotation }}
            transition={{ duration: reduce ? 0 : 3.8, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: `${C}px ${C}px` }}
          >
            {selectedRoles.map((id, k) => (
              <path key={`w-${id}`} d={wedge(k)} fill={getRole(id)?.color ?? "#555"} fillOpacity={0.82} stroke="#0a0b0e" strokeWidth={1.5} />
            ))}
            {/* Centre vignette for depth */}
            <circle cx={C} cy={C} r={WHEEL_R} fill="url(#wheelVig)" pointerEvents="none" />

            {/* Section labels (spin with the dial) */}
            {selectedRoles.map((id, k) => {
              const mid = (k + 0.5) * sectionDeg;
              const flip = mid > 90 && mid < 270;
              const t = `rotate(${mid} ${C} ${C}) translate(0 ${-LABEL_R})${flip ? ` rotate(180 ${C} ${C - LABEL_R})` : ""}`;
              return (
                <text
                  key={`t-${id}`}
                  x={C}
                  y={C - LABEL_R}
                  transform={t}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="wheel-seg-text"
                >
                  {shortName(id)}
                </text>
              );
            })}
          </motion.g>

          {/* Metal rim */}
          <circle cx={C} cy={C} r={WHEEL_R} fill="none" stroke="#2a2d35" strokeWidth={6} />
          <circle cx={C} cy={C} r={WHEEL_R + 4} fill="none" stroke="#0a0b0e" strokeWidth={3} />

          {/* Pointer at top */}
          <polygon points={`${C - 11},${C - WHEEL_R - 14} ${C + 11},${C - WHEEL_R - 14} ${C},${C - WHEEL_R + 6}`} fill="var(--amber)" stroke="#0a0b0e" strokeWidth={1} />

          {/* Hub */}
          <circle cx={C} cy={C} r={26} fill="url(#hubMetal)" stroke="var(--amber)" strokeWidth={2} />
          <text x={C} y={C} textAnchor="middle" dominantBaseline="central" className="wheel-hub-text">
            {settled ? "✓" : "♪"}
          </text>
        </svg>

        {/* Avatars around the rim (do not spin) */}
        {players.map((p, i) => {
          const pos = onCircle((360 * i) / players.length, AVATAR_R);
          const role = getRole(assignments[p.id]);
          const isSelf = p.id === selfId;
          return (
            <div key={p.id} className="wheel-avatar" style={{ left: pos.x - 22, top: pos.y - 22 }}>
              <motion.div animate={settled && isSelf ? { scale: [1, 1.18, 1] } : {}} transition={{ duration: 0.5 }}>
                <PlayerAvatar id={p.id} name={p.name} dim={!p.connected} />
              </motion.div>
              {settled && role && (
                <motion.div
                  className="wheel-role"
                  style={{ color: role.color, borderColor: role.color }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {role.name}
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
      {settled && (
        <motion.div className="wheel-self" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          You play the{" "}
          <span style={{ color: getRole(assignments[selfId])?.color }}>{getRole(assignments[selfId])?.name ?? "—"}</span>{" "}
          on every song
        </motion.div>
      )}
    </div>
  );
}
