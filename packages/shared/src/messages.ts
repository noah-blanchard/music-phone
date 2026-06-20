import type { GameConfig, Melody, Note, RoomSnapshot } from "./types";
import type { Layer, Role } from "./modes/types";

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
  /** Chosen sound id for this layer (instrument or drum kit); optional. */
  instrumentId?: string;
}

export interface MsgSubmit {
  type: "turn:submit";
  notes: Note[];
  /** Chosen sound id for this layer (instrument or drum kit); optional. */
  instrumentId?: string;
}

export interface MsgReady {
  type: "player:ready";
  ready: boolean;
}

export interface MsgLeave {
  type: "room:leave";
}

/**
 * Results-phase reveal control. Only accepted from the active song's seed player
 * (its author). Setting `activeSong` to the next index advances the room-wide
 * presentation to the next song; the server clamps and rebroadcasts.
 */
export interface MsgReveal {
  type: "reveal:update";
  activeSong: number;
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
  /** Read-only prior layers shown as context (0..many per the host setting). */
  contextLayers: Layer[];
  /** The role to fill this round. */
  role: Role;
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
