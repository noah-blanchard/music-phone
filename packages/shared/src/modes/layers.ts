import { TIMBRES, loopSteps, type GameConfig, type Melody, type Note } from "../types";
import { buildScaleWindow } from "../scales";
import { rotate } from "./continue";
import type { GameMode, Layer, Role, RoundContext } from "./types";

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
export const LAYER_ROLES: Role[] = [
  { id: "melody", name: "Melody", color: "#4fd0ff", editor: "piano-roll", instrumentId: "lead", octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "chords", name: "Chords", color: "#8b6fd6", editor: "piano-roll", instrumentId: "keys", octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "bass", name: "Bass", color: "#4ee6a0", editor: "piano-roll", instrumentId: "bass", octaveOffset: -1, octaves: 2, scaleLocked: true },
  { id: "drums", name: "Drums", color: "#ffae42", editor: "drum-grid", instrumentId: "drums", octaveOffset: 0, octaves: 1, scaleLocked: false },
  { id: "arp", name: "Arp", color: "#f2c14e", editor: "piano-roll", instrumentId: "pluck", octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "pad", name: "Pad", color: "#3aa6a6", editor: "piano-roll", instrumentId: "pad", octaveOffset: 0, octaves: 2, scaleLocked: true },
  { id: "lead", name: "Lead", color: "#ff7a59", editor: "piano-roll", instrumentId: "saw", octaveOffset: 1, octaves: 2, scaleLocked: true },
  { id: "perc", name: "Perc", color: "#e36cc4", editor: "drum-grid", instrumentId: "drums", octaveOffset: 0, octaves: 1, scaleLocked: false },
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

/** Allowed in-scale pitches for a pitched role's window. */
export function rolePitchWindow(config: GameConfig, role: Role): number[] {
  return buildScaleWindow(config.scale, config.root + role.octaveOffset * 12, role.octaves);
}

function validatePitched(notes: unknown, config: GameConfig, role: Role, max = 512): Note[] {
  if (!Array.isArray(notes)) return [];
  const allowed = new Set(rolePitchWindow(config, role));
  const maxStep = loopSteps(config);
  const out: Note[] = [];
  for (const v of notes) {
    if (!isObject(v)) continue;
    const { pitch, start, length } = v;
    if (!isFiniteInt(pitch) || !isFiniteInt(start) || !isFiniteInt(length)) continue;
    if (!allowed.has(pitch)) continue;
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
  const toLayer = (order: number, roleId: string | undefined, notes: Note[]): Layer => ({
    roleId: roleOfSegment(order, roleId)?.id ?? roleId ?? "",
    notes,
  });
  let layers: Layer[] = [];
  if (config.contextVisibility === "all") {
    layers = song.segments.map((s) => toLayer(s.order, s.roleId, s.notes));
  } else if (config.contextVisibility === "previous") {
    const last = song.segments[song.segments.length - 1];
    if (last) layers = [toLayer(last.order, last.roleId, last.notes)];
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
      : validatePitched(notes, config, role);
  },
};
