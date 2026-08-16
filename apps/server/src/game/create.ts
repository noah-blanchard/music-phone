import {
  DEFAULT_CONFIG,
  MAX_PLAYERS,
  sanitizeConfig,
  type GameConfig,
  type Player,
  type Room,
} from "@musicphone/shared";
import type { ReducerContext } from "./reducer";

/**
 * Room creation and joining. Separate from the reducer because neither fits
 * `(room, command) => room`: creation has no room yet, and joining has to hand
 * a freshly minted playerId back to the HTTP caller.
 *
 * Both are pure — all randomness comes from the injected context.
 */

/** Room-code alphabet with the ambiguous 0/O and 1/I removed. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const NAME_MAX_LENGTH = 20;

/** Trim a submitted nickname to something safe to render and store. */
export function cleanName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : "Player";
}

/** A room code of `length` characters drawn from the unambiguous alphabet. */
export function randomCode(random: () => number, length = 4): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

export interface CreatedRoom {
  room: Room;
  /** The host's id — they are the first player. */
  playerId: string;
}

/**
 * Build a new room in the lobby phase with its creator as host.
 *
 * The host starts `connected: false`; they become connected when their
 * WebSocket opens, which is also what stops the room being reaped.
 */
export function createRoom(
  code: string,
  hostName: string,
  config: Partial<GameConfig> | undefined,
  ctx: ReducerContext,
): CreatedRoom {
  const hostId = ctx.uuid();
  const host: Player = {
    id: hostId,
    name: cleanName(hostName),
    connected: false,
    isHost: true,
  };

  return {
    room: {
      code,
      hostId,
      phase: "lobby",
      config: sanitizeConfig(config ?? {}, DEFAULT_CONFIG),
      players: [host],
      round: 0,
      totalRounds: 0,
      melodies: [],
      roundEndsAt: 0,
      ready: {},
      turns: {},
      assignments: {},
      wheelOffsetDeg: 0,
      reveal: { activeSong: 0, revealedLayers: 0, playing: false, done: false },
    },
    playerId: hostId,
  };
}

export type JoinResult = { room: Room; playerId: string } | { error: string };

/**
 * Add a player to a room that is still in its lobby. Returns a new room; the
 * input is untouched.
 */
export function joinRoom(room: Room, name: string, ctx: ReducerContext): JoinResult {
  if (room.phase !== "lobby") return { error: "Game already started" };
  if (room.players.length >= MAX_PLAYERS) return { error: "Room is full" };

  const playerId = ctx.uuid();
  const next = structuredClone(room);
  next.players.push({ id: playerId, name: cleanName(name), connected: false, isHost: false });
  return { room: next, playerId };
}
