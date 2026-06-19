import type { GameConfig, Melody, Note, RoomSnapshot } from "./types";
import type { Role, RoundContext } from "./modes/types";

/**
 * WebSocket protocol. All realtime gameplay flows over these discriminated
 * unions. The server is authoritative on phase, timer and rotation.
 *
 * HTTP (Eden Treaty) is used only to create/join a room and obtain a playerId;
 * once connected, everything else is WebSocket.
 */

/* ----------------------------- Client -> Server ---------------------------- */

export interface MsgStart {
  type: "game:start";
}

export interface MsgConfigUpdate {
  type: "config:update";
  config: Partial<GameConfig>;
}

export interface MsgAutosave {
  type: "turn:autosave";
  notes: Note[];
}

export interface MsgSubmit {
  type: "turn:submit";
  notes: Note[];
}

export interface MsgReady {
  type: "player:ready";
  ready: boolean;
}

export interface MsgLeave {
  type: "room:leave";
}

/**
 * Results-phase reveal control. Only accepted from the song's seed player; the
 * server clamps and rebroadcasts so everyone follows the same guided reveal.
 */
export interface MsgReveal {
  type: "reveal:update";
  songId: string;
  revealedLayers: number;
  playing: boolean;
}

export type ClientMessage =
  | MsgStart
  | MsgConfigUpdate
  | MsgAutosave
  | MsgSubmit
  | MsgReady
  | MsgReveal
  | MsgLeave;

export type ClientMessageType = ClientMessage["type"];

/* ----------------------------- Server -> Client ---------------------------- */

export interface MsgSnapshot {
  type: "room:snapshot";
  room: RoomSnapshot;
}

export interface MsgRoundStarted {
  type: "round:started";
  round: number;
  /**
   * Read-only context for this turn (mode-specific): the previous trailing
   * measure in `continue`, or 0..many prior layers in `layers`.
   */
  context: RoundContext;
  /** The role to fill this round (layers mode); null when the mode has no roles. */
  role: Role | null;
  /** Epoch milliseconds at which this round auto-advances. */
  endsAt: number;
}

export interface MsgRoundEnded {
  type: "round:ended";
  round: number;
}

export interface MsgGameFinished {
  type: "game:finished";
  melodies: Melody[];
}

export interface MsgError {
  type: "error";
  code: string;
  message: string;
}

export type ServerMessage =
  | MsgSnapshot
  | MsgRoundStarted
  | MsgRoundEnded
  | MsgGameFinished
  | MsgError;

export type ServerMessageType = ServerMessage["type"];
