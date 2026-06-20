import type { GameConfig, GameModeId, Melody, Note } from "../types";

/**
 * A role is one layer's job in `layers` mode (e.g. Melody, Chords, Drums). Role
 * definitions are pure data so the server and client agree exactly; the web app
 * resolves `instrumentId` to an actual Tone.js sound via its sound registry.
 */
export interface Role {
  id: string;
  name: string;
  /** Signature colour for this layer in the grid + results. */
  color: string;
  /** Which editor a player uses for this role. */
  editor: "piano-roll" | "drum-grid";
  /**
   * Candidate sound ids the player may pick from (`[0]` is the default). For
   * pitched roles these are instrument ids; for drum roles they are kit ids.
   * Resolved by the web sound registry.
   */
  instruments: string[];
  /** Default scroll-focus octave offset from `config.root` (piano-roll roles). */
  octaveOffset: number;
  /** Suggested focus height in octaves (piano-roll roles). */
  octaves: number;
  /** Pitched roles default to scale-lock (toggleable); drum roles are not. */
  scaleLocked: boolean;
}

/** The default sound id for a role (the first candidate). */
export function roleDefaultSound(role: Role): string {
  return role.instruments[0] ?? "";
}

/** One stacked contribution over the shared bars (layers mode playback unit). */
export interface Layer {
  roleId: string;
  /** Chosen sound id (instrument or kit); falls back to the role default. */
  instrumentId?: string;
  notes: Note[];
}

/**
 * The contract every game mode implements. `RoomManager` and the client are
 * mode-agnostic: they look the mode up in the registry and delegate. Everything
 * here is pure (no Tone.js, no sockets) so it lives in the shared package.
 */
export interface GameMode {
  id: GameModeId;
  name: string;
  description: string;
  /** Number of rounds (and so layers/segments per song) for a player count. */
  totalRounds(playerCount: number, config: GameConfig): number;
  /** Which song a player edits in a given round. */
  assign(playerIndex: number, round: number, n: number): number;
  /** Read-only prior layers for the player editing `song` this round. */
  buildContext(song: Melody, round: number, config: GameConfig): Layer[];
  /** Number of editable steps in a turn for this mode. */
  turnSteps(config: GameConfig): number;
  /** Validate + normalize a submitted turn for the player's role/geometry. */
  validateTurn(notes: unknown, config: GameConfig, role: Role): Note[];
}
