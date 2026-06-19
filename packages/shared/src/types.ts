/**
 * Core domain types shared by the server and the web client.
 *
 * Conventions:
 * - `pitch` is a MIDI note number (e.g. 60 = middle C).
 * - `start` / `length` are expressed in grid steps. With 16th-note resolution
 *   there are `stepsPerMeasure` (16) steps per measure and `STEPS_PER_TURN`
 *   (= stepsPerMeasure * measuresPerTurn = 64) steps in a single 4-measure turn.
 */

export type ScaleType = "major" | "minor" | "pentatonic";

/** The four built-in Tone.js oscillator timbres available in V1. */
export type Timbre = "sine" | "triangle" | "sawtooth" | "square";

export const TIMBRES: readonly Timbre[] = ["sine", "triangle", "sawtooth", "square"];

/** A single note placed on the piano roll during one turn. */
export interface Note {
  /** MIDI note number, constrained to the active scale. */
  pitch: number;
  /** Start position in steps, relative to the start of the turn (0-based). */
  start: number;
  /** Duration in steps (>= 1). */
  length: number;
  /** Which oscillator timbre plays this note. */
  timbre: Timbre;
}

/** One player's contribution to a melody (a single 4-measure turn). */
export interface Segment {
  authorId: string;
  authorName: string;
  /** Position of this segment within its melody chain (0-based). */
  order: number;
  notes: Note[];
}

/** A melody that grows by one segment each rotation round. */
export interface Melody {
  id: string;
  seedPlayerId: string;
  segments: Segment[];
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export type Phase = "lobby" | "playing" | "results";

/** Immutable-once-started configuration chosen by the host. */
export interface GameConfig {
  bpm: number;
  /** Root pitch class as a MIDI number in the base octave (e.g. 60 = C4). */
  root: number;
  scale: ScaleType;
  /** Fixed at 16 (16th notes) in V1. */
  stepsPerMeasure: number;
  /** Fixed at 4 in V1. */
  measuresPerTurn: number;
  /** Number of visible octaves on the piano roll. */
  octaves: number;
  /** Round countdown length in seconds. */
  roundDurationSec: number;
}

/** Authoritative room state held in-memory by the server. */
export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  config: GameConfig;
  players: Player[];
  /** Current rotation round index (0-based). Meaningful while `phase === "playing"`. */
  round: number;
  /** Total number of rounds === number of players locked in at game start. */
  totalRounds: number;
  melodies: Melody[];
  /** Epoch milliseconds at which the current round auto-advances. */
  roundEndsAt: number;
  /** Per-player ready flag for the current round, keyed by playerId. */
  ready: Record<string, boolean>;
}

/**
 * A sanitized view of a room sent to clients. Future segments of melodies the
 * player has not yet seen are stripped so the "telephone" surprise is preserved.
 */
export interface RoomSnapshot {
  code: string;
  hostId: string;
  phase: Phase;
  config: GameConfig;
  players: Player[];
  round: number;
  totalRounds: number;
  roundEndsAt: number;
  ready: Record<string, boolean>;
  /** The local player's id (so the client knows which player it controls). */
  selfId: string;
  /**
   * Only populated when `phase === "results"`: the full set of finished melodies.
   * Empty during lobby/playing.
   */
  melodies: Melody[];
}

/** Default game configuration applied when a host creates a room. */
export const DEFAULT_CONFIG: GameConfig = {
  bpm: 100,
  root: 60, // C4
  scale: "major",
  stepsPerMeasure: 16,
  measuresPerTurn: 4,
  octaves: 2,
  roundDurationSec: 180,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Steps in a single turn for a given config. */
export function stepsPerTurn(config: GameConfig): number {
  return config.stepsPerMeasure * config.measuresPerTurn;
}
