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

const SIZE = 340;
const C = SIZE / 2;
const WHEEL_R = 130;
const AVATAR_R = 150;
const SPINS = 5;

/** Position on a circle, angle measured clockwise from the top (12 o'clock). */
function onCircle(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

/**
 * The role draft: a prize wheel of role-coloured sectors with every player's
 * avatar pinned evenly around the rim. The wheel spins to the server-decided
 * `wheelOffsetDeg`; when it stops, each avatar reveals the role it landed on.
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

  // Conic gradient of hard-edged role sectors.
  const gradient = `conic-gradient(from 0deg, ${selectedRoles
    .map((id, k) => {
      const col = getRole(id)?.color ?? "#555";
      return `${col} ${k * sectionDeg}deg ${(k + 1) * sectionDeg}deg`;
    })
    .join(", ")})`;

  const targetRotation = reduce ? wheelOffsetDeg : SPINS * 360 + wheelOffsetDeg;

  return (
    <div className="wheel-wrap">
      <div className="wheel-title">Dealing parts…</div>
      <div className="wheel-stage" style={{ width: SIZE, height: SIZE }}>
        {/* Spinning wheel face */}
        <motion.div
          className="wheel-face"
          style={{ width: WHEEL_R * 2, height: WHEEL_R * 2, left: C - WHEEL_R, top: C - WHEEL_R, background: gradient }}
          initial={{ rotate: 0 }}
          animate={{ rotate: targetRotation }}
          transition={{ duration: reduce ? 0 : 3.8, ease: [0.16, 1, 0.3, 1] }}
        />
        <div className="wheel-hub" style={{ left: C - 26, top: C - 26 }}>
          {settled ? "✓" : "♪"}
        </div>

        {/* Avatars pinned around the rim (do not spin) */}
        {players.map((p, i) => {
          const angle = (360 * i) / players.length;
          const pos = onCircle(angle, AVATAR_R);
          const role = getRole(assignments[p.id]);
          const isSelf = p.id === selfId;
          return (
            <div key={p.id} className="wheel-avatar" style={{ left: pos.x - 22, top: pos.y - 22 }}>
              <motion.div
                animate={settled && isSelf ? { scale: [1, 1.18, 1] } : {}}
                transition={{ duration: 0.5 }}
              >
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
        <motion.div
          className="wheel-self"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          You play{" "}
          <span style={{ color: getRole(assignments[selfId])?.color }}>
            {getRole(assignments[selfId])?.name ?? "—"}
          </span>{" "}
          on every song
        </motion.div>
      )}
    </div>
  );
}
