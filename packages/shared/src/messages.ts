import type { GameConfig, Melody, Note, RoomSnapshot } from "./types";

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

export type ClientMessage =
  | MsgStart
  | MsgConfigUpdate
  | MsgAutosave
  | MsgSubmit
  | MsgReady
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
   * The last measure of the melody assigned to this player, shown read-only as
   * context. Empty for the very first round (seed melodies start blank).
   * Step indices are normalized to 0..stepsPerMeasure-1.
   */
  contextNotes: Note[];
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
