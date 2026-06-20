/**
 * Core domain types shared by the server and the web client.
 *
 * Conventions:
 * - `pitch` is a MIDI note number (e.g. 60 = middle C).
 * - `start` / `length` are expressed in grid steps. With 16th-note resolution
 *   there are `stepsPerMeasure` (16) steps per measure, so one loop is
 *   `stepsPerMeasure * barsPerSong` steps (see `loopSteps`).
 */

export type ScaleType = "major" | "minor" | "pentatonic";

/**
 * Identifies a game mode. Modes are plug-in modules (see `src/modes/`): adding a
 * mode means adding a module + a registry entry and extending this union.
 */
export type GameModeId = "layers";

/**
 * How much of the prior work a player is shown when their turn starts. `previous`
 * = only the single most recent layer, `all` = everything so far, `blind` = nothing.
 */
export type ContextVisibility = "previous" | "all" | "blind";

/** A single note placed on the grid. For drum lanes `pitch` is the lane index. */
export interface Note {
  /** MIDI note number (pitched roles) or drum-lane index (drum roles). */
  pitch: number;
  /** Start position in steps, relative to the start of the loop (0-based). */
  start: number;
  /** Duration in steps (>= 1). */
  length: number;
}

/**
 * One player's contribution to a song: a full-loop layer for one role. All
 * segments of a song share the same bars and stack simultaneously.
 */
export interface Segment {
  authorId: string;
  authorName: string;
  /** Layer index within the song (0-based = round). */
  order: number;
  /** The role this layer fills. */
  roleId?: string;
  /**
   * The sound the author chose for this layer: an instrument id for pitched
   * roles, a kit id for drum roles. Falls back to the role default if absent.
   */
  instrumentId?: string;
  notes: Note[];
}

/** A song that gains one stacked layer (segment) each rotation round. */
export interface Melody {
  id: string;
  seedPlayerId: string;
  /** Per-song tempo, rolled randomly at game start (slot machine). */
  bpm: number;
  /** Per-song root pitch (MIDI), rolled randomly at game start. */
  root: number;
  /** Per-song scale, rolled randomly at game start. */
  scale: ScaleType;
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
  /** Which game mode is played. */
  mode: GameModeId;
  /** Fixed at 16 (16th notes). */
  stepsPerMeasure: number;
  /** Length of the shared loop every layer is written over (2–8 bars). */
  barsPerSong: number;
  /** How much prior work a player sees at turn start. */
  contextVisibility: ContextVisibility;
  /** Role ids the host enabled for the wheel (must be >= player count to start). */
  selectedRoles: string[];
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
  /** Wheel-assigned role per player (playerId → roleId), set at game start. */
  assignments: Record<string, string>;
  /** Final wheel rotation in degrees, for the synced spin animation. */
  wheelOffsetDeg: number;
  /**
   * Results-only: the single, room-wide "guided reveal" cursor. One song is
   * presented at a time, driven by that song's seed player (its author).
   */
  reveal: RevealState;
}

/** Room-wide guided-reveal cursor (results phase). */
export interface RevealState {
  /** Index into `melodies` of the song currently being presented. */
  activeSong: number;
  /** Layers of the active song currently revealed (audible/visible to everyone). */
  revealedLayers: number;
  /** Whether the active song's loop is running. */
  playing: boolean;
  /** True once every song has been presented. */
  done: boolean;
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
  /** Wheel-assigned role per player (playerId → roleId). */
  assignments: Record<string, string>;
  /** Final wheel rotation in degrees, for the synced spin animation. */
  wheelOffsetDeg: number;
  /** Room-wide guided-reveal cursor (results phase only). */
  reveal: RevealState;
}

/**
 * Canonical layer-role ids (must mirror `LAYER_ROLES` in `modes/layers.ts`).
 * Kept here so `DEFAULT_CONFIG` can default to "all roles" without a circular
 * import; `sanitizeConfig` filters selections against the real role table.
 */
export const DEFAULT_SELECTED_ROLES = [
  "melody",
  "chords",
  "bass",
  "drums",
  "arp",
  "pad",
  "lead",
  "perc",
];

/** Default game configuration applied when a host creates a room. */
export const DEFAULT_CONFIG: GameConfig = {
  mode: "layers",
  stepsPerMeasure: 16,
  barsPerSong: 4,
  contextVisibility: "previous",
  selectedRoles: [...DEFAULT_SELECTED_ROLES],
  roundDurationSec: 180,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Slot-machine pools — each song rolls one value from each at game start. */
export const BPM_CHOICES = [80, 90, 100, 110, 120, 130, 140];
/** Candidate root pitches (MIDI 60..71 = C4..B4). */
export const KEY_CHOICES = Array.from({ length: 12 }, (_, i) => 60 + i);
export const SCALE_CHOICES: ScaleType[] = ["major", "minor", "pentatonic"];

export const MIN_BARS_PER_SONG = 2;
export const MAX_BARS_PER_SONG = 8;

/**
 * Full pitch range the layers piano roll renders (C2..C7). Wide and scrollable;
 * roles only set the *default scroll focus*, not placement bounds. Server-side
 * pitched validation accepts any pitch in this range (the scale-lock is a
 * client-side editing aid with a per-player toggle).
 */
export const PIANO_MIN = 36; // C2
export const PIANO_MAX = 96; // C7

/** Steps in one loop (the shared bars every layer is written over). */
export function loopSteps(config: GameConfig): number {
  return config.stepsPerMeasure * config.barsPerSong;
}
