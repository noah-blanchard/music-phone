import {
  PIANO_MAX,
  PIANO_MIN,
  TIMBRES,
  loopSteps,
  type GameConfig,
  type Melody,
  type Note,
} from "../types";
import type { GameMode, Layer, Role, RoundContext } from "./types";
import { rotate } from "./continue";

/**
 * Upper bound on drum lanes. The web `DRUM_KIT` registry defines the actual
 * ordered lanes (≤ this); a drum note's `pitch` is the lane index. The server
 * only needs the bound to validate, so adding a drum sound stays a web-only,
 * one-file change.
 */
export const MAX_DRUM_VOICES = 12;

/**
 * The ordered role preset. Round `r` uses `LAYER_ROLES[r]`, so with N players a
 * song stacks `LAYER_ROLES.slice(0, N)`. Colours mirror the player palette.
 */
const DRUM_KITS = ["kit-synth", "kit-808", "kit-lofi"];

export const LAYER_ROLES: Role[] = [
  { id: "melody", name: "Melody", color: "#4fd0ff", editor: "piano-roll", instruments: ["lead", "fmlead", "amlead", "pluck", "saw"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "chords", name: "Chords", color: "#8b6fd6", editor: "piano-roll", instruments: ["keys", "pad", "fmkeys", "ampad"], octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "bass", name: "Bass", color: "#4ee6a0", editor: "piano-roll", instruments: ["bass", "monobass", "fmbass"], octaveOffset: -1, octaves: 2, scaleLocked: true },
  { id: "drums", name: "Drums", color: "#ffae42", editor: "drum-grid", instruments: DRUM_KITS, octaveOffset: 0, octaves: 1, scaleLocked: false },
  { id: "arp", name: "Arp", color: "#f2c14e", editor: "piano-roll", instruments: ["pluck", "fmlead", "lead"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "pad", name: "Pad", color: "#3aa6a6", editor: "piano-roll", instruments: ["pad", "ampad", "fmkeys"], octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "lead", name: "Lead", color: "#ff7a59", editor: "piano-roll", instruments: ["saw", "lead", "fmlead", "amlead"], octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "perc", name: "Perc", color: "#e36cc4", editor: "drum-grid", instruments: DRUM_KITS, octaveOffset: 0, octaves: 1, scaleLocked: false },
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
function cleanTimbre(v: unknown): Note["timbre"] {
  return typeof v === "string" && TIMBRES.includes(v as Note["timbre"])
    ? (v as Note["timbre"])
    : "sine";
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
    out.push({ pitch, start, length, timbre: cleanTimbre(v.timbre) });
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
    out.push({ pitch, start, length: 1, timbre: "sine" });
    if (out.length >= max) break;
  }
  return out;
}

/** Layers context: 0..many prior layers per the host's visibility setting. */
function buildLayerContext(song: Melody, config: GameConfig): RoundContext {
  const toLayer = (s: Melody["segments"][number]): Layer => ({
    roleId: roleOfSegment(s.order, s.roleId)?.id ?? s.roleId ?? "",
    instrumentId: s.instrumentId,
    notes: s.notes,
  });
  let layers: Layer[] = [];
  if (config.contextVisibility === "all") {
    layers = song.segments.map(toLayer);
  } else if (config.contextVisibility === "previous") {
    const last = song.segments[song.segments.length - 1];
    if (last) layers = [toLayer(last)];
  }
  return { kind: "layers", layers };
}

/** "Layered Arrangement": each round adds a different role over the same loop. */
export const layersMode: GameMode = {
  id: "layers",
  name: "Layered Arrangement",
  description:
    "Build one looped song together: each round a different player adds a new part — melody, chords, bass, drums…",
  totalRounds: (playerCount) => playerCount,
  assign: rotate,
  roleForRound: (round) => LAYER_ROLES[round] ?? null,
  buildContext: (song, _round, config) => buildLayerContext(song, config),
  turnSteps: (config) => loopSteps(config),
  validateTurn: (notes, round, config) => {
    const role = LAYER_ROLES[round];
    if (!role) return [];
    return role.editor === "drum-grid"
      ? validateDrums(notes, config)
      : validatePitched(notes, config);
  },
};
