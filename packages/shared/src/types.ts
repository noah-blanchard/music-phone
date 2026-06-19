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

/**
 * Identifies a game mode. Modes are plug-in modules (see `src/modes/`): adding a
 * mode means adding a module + a registry entry and extending this union.
 */
export type GameModeId = "continue" | "layers";

/**
 * How much of the prior work a player is shown when their turn starts (layers
 * mode). `previous` = only the single most recent layer, `all` = everything so
 * far, `blind` = nothing.
 */
export type ContextVisibility = "previous" | "all" | "blind";

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

/**
 * One player's contribution to a song. In `continue` mode this is a 4-measure
 * turn appended in time; in `layers` mode it is a full-loop layer for one role
 * (all segments share the same bars and stack simultaneously).
 */
export interface Segment {
  authorId: string;
  authorName: string;
  /** Position within the song: turn index in `continue`, layer index in `layers`. */
  order: number;
  /** The role this layer fills (layers mode). Absent in `continue`. */
  roleId?: string;
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
  /** Which game mode is played. Defaults to "layers". */
  mode: GameModeId;
  bpm: number;
  /** Root pitch class as a MIDI number in the base octave (e.g. 60 = C4). */
  root: number;
  scale: ScaleType;
  /** Fixed at 16 (16th notes). */
  stepsPerMeasure: number;
  /** `continue` mode: how many new measures a turn appends. */
  measuresPerTurn: number;
  /** `layers` mode: length of the shared loop every layer is written over (2–8). */
  barsPerSong: number;
  /** `layers` mode: how much prior work a player sees at turn start. */
  contextVisibility: ContextVisibility;
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
  /**
   * Results-only: the synced "guided reveal" state per song, keyed by melody id.
   * Driven by each song's seed player so everyone follows the same reveal.
   */
  reveal: Record<string, RevealState>;
}

/** Synced reveal state for one finished song (results phase). */
export interface RevealState {
  /** Number of layers currently revealed (audible/visible to everyone). */
  revealedLayers: number;
  /** Whether the controller has the loop running. */
  playing: boolean;
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
  /** Synced reveal state per song id (results phase only). */
  reveal: Record<string, RevealState>;
}

/** Default game configuration applied when a host creates a room. */
export const DEFAULT_CONFIG: GameConfig = {
  mode: "layers",
  bpm: 100,
  root: 60, // C4
  scale: "major",
  stepsPerMeasure: 16,
  measuresPerTurn: 4,
  barsPerSong: 4,
  contextVisibility: "previous",
  octaves: 2,
  roundDurationSec: 180,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const MIN_BARS_PER_SONG = 2;
export const MAX_BARS_PER_SONG = 8;

/** Steps in a single `continue`-mode turn (measures appended per turn). */
export function stepsPerTurn(config: GameConfig): number {
  return config.stepsPerMeasure * config.measuresPerTurn;
}

/** Steps in one `layers`-mode loop (the shared bars every layer is written over). */
export function loopSteps(config: GameConfig): number {
  return config.stepsPerMeasure * config.barsPerSong;
}
