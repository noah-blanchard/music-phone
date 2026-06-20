import { PIANO_MAX, PIANO_MIN, loopSteps, type GameConfig, type Melody, type Note } from "../types";
import type { GameMode, Layer, Role } from "./types";

/**
 * Fixed-step rotation: in round `r` player `i` works on song `(i + r) % n`. A
 * derangement for every round 1..n-1, visiting each song exactly once over n
 * rounds.
 */
export function rotate(playerIndex: number, round: number, n: number): number {
  return (playerIndex + round) % n;
}

/**
 * Upper bound on drum lanes. The web `DRUM_KIT` registry defines the actual
 * ordered lanes (≤ this); a drum note's `pitch` is the lane index. The server
 * only needs the bound to validate, so adding a drum sound stays a web-only,
 * one-file change.
 */
export const MAX_DRUM_VOICES = 12;

/**
 * The playable "kits". One drum part (the step sequencer) plus seven melodic
 * kits — sound flavours that all just place notes on the piano roll, differing
 * by their instrument pool and octave focus. The wheel deals one kit per player;
 * the host enables a subset (>= player count). `Role`/`roleId` are the internal
 * names; the UI calls these "Kits".
 */
const DRUM_KITS = ["kit-synth", "kit-808", "kit-lofi"];

export const LAYER_ROLES: Role[] = [
  { id: "drums", name: "Drums", color: "#ffae42", editor: "drum-grid", instruments: DRUM_KITS, octaveOffset: 0, octaves: 1, scaleLocked: false },
  { id: "lead", name: "Lead Kit", color: "#ff7a59", editor: "piano-roll", instruments: ["lead", "saw", "amlead"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "synth", name: "Synth Kit", color: "#4fd0ff", editor: "piano-roll", instruments: ["fmlead", "saw", "lead"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "bass", name: "Bass Kit", color: "#4ee6a0", editor: "piano-roll", instruments: ["bass", "monobass", "fmbass"], octaveOffset: -1, octaves: 2, scaleLocked: true },
  { id: "pluck", name: "Pluck Kit", color: "#f2c14e", editor: "piano-roll", instruments: ["pluck", "fmlead"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "pad", name: "Pad Kit", color: "#3aa6a6", editor: "piano-roll", instruments: ["pad", "ampad"], octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "keys", name: "Keys Kit", color: "#8b6fd6", editor: "piano-roll", instruments: ["keys", "fmkeys"], octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "stab", name: "Stab Kit", color: "#e36cc4", editor: "piano-roll", instruments: ["fmkeys", "keys", "saw"], octaveOffset: 0, octaves: 2, scaleLocked: true },
];

/** Resolve a role by id (used by both apps). */
export function getRole(roleId: string | undefined): Role | undefined {
  return LAYER_ROLES.find((r) => r.id === roleId);
}

/** The role of a segment: explicit `roleId`, else derived from its order. */
export function roleOfSegment(order: number, roleId?: string): Role | undefined {
  return getRole(roleId) ?? LAYER_ROLES[order];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

function validatePitched(notes: unknown, config: GameConfig, max = 512): Note[] {
  if (!Array.isArray(notes)) return [];
  const maxStep = loopSteps(config);
  const out: Note[] = [];
  for (const v of notes) {
    if (!isObject(v)) continue;
    const { pitch, start, length } = v;
    if (!isFiniteInt(pitch) || !isFiniteInt(start) || !isFiniteInt(length)) continue;
    // Accept any pitch in the visible range — the scale-lock is a client-side
    // editing aid with a per-player toggle, not a hard constraint.
    if (pitch < PIANO_MIN || pitch > PIANO_MAX) continue;
    if (start < 0 || start >= maxStep) continue;
    if (length < 1 || start + length > maxStep) continue;
    out.push({ pitch, start, length });
    if (out.length >= max) break;
  }
  return out;
}

function validateDrums(notes: unknown, config: GameConfig, max = 512): Note[] {
  if (!Array.isArray(notes)) return [];
  const maxStep = loopSteps(config);
  const out: Note[] = [];
  for (const v of notes) {
    if (!isObject(v)) continue;
    const { pitch, start } = v;
    if (!isFiniteInt(pitch) || !isFiniteInt(start)) continue;
    if (pitch < 0 || pitch >= MAX_DRUM_VOICES) continue;
    if (start < 0 || start >= maxStep) continue;
    out.push({ pitch, start, length: 1 });
    if (out.length >= max) break;
  }
  return out;
}

/** Read-only prior layers shown per the host's visibility setting. */
function buildLayerContext(song: Melody, config: GameConfig): Layer[] {
  const toLayer = (s: Melody["segments"][number]): Layer => ({
    roleId: roleOfSegment(s.order, s.roleId)?.id ?? s.roleId ?? "",
    instrumentId: s.instrumentId,
    notes: s.notes,
  });
  if (config.contextVisibility === "all") return song.segments.map(toLayer);
  if (config.contextVisibility === "previous") {
    const last = song.segments[song.segments.length - 1];
    return last ? [toLayer(last)] : [];
  }
  return [];
}

/**
 * Wheel-of-fortune assignment. Player avatars sit evenly around the rim
 * (avatar `i` at `360*i/n`); the wheel of `m` role sections (each `360/m` wide)
 * rests at `offsetDeg`. Returns, per avatar, the section index it lands on.
 * Distinct for every avatar when `m >= n` (even spacing); the caller re-rolls
 * `offsetDeg` on the rare floating-point boundary collision.
 */
export function assignWheel(playerCount: number, roleCount: number, offsetDeg: number): number[] {
  const sectionDeg = 360 / roleCount;
  const out: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    const avatarDeg = (360 * i) / playerCount;
    // Section whose centre is nearest the avatar after the wheel rotates by offsetDeg.
    const k = Math.round((avatarDeg - offsetDeg - sectionDeg / 2) / sectionDeg);
    out.push(((k % roleCount) + roleCount) % roleCount);
  }
  return out;
}

/** "Layered Arrangement": each player owns one role and adds it to every song. */
export const layersMode: GameMode = {
  id: "layers",
  name: "Layered Arrangement",
  description:
    "Build looped songs together: each player is dealt one part — melody, chords, bass, drums… — and lays it on every song.",
  totalRounds: (playerCount) => playerCount,
  assign: rotate,
  buildContext: (song, _round, config) => buildLayerContext(song, config),
  turnSteps: (config) => loopSteps(config),
  validateTurn: (notes, config, role) =>
    role.editor === "drum-grid" ? validateDrums(notes, config) : validatePitched(notes, config),
};
