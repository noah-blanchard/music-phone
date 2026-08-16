import type { ServerMessage } from "@musicphone/shared";

/**
 * How server messages reach the players in a room.
 *
 * `ConnectionRegistry` satisfies this directly: with one instance, "publish to
 * the room" and "write to the sockets I am holding" are the same thing.
 *
 * With several instances they stop being the same thing, because a room's
 * players may be spread across them. A Redis-backed implementation would
 * publish to a per-room channel and let every instance deliver to its own
 * sockets — the callers, which only ever ask for a message to reach a room or a
 * player, would not change.
 */
export interface RoomBus {
  /** Deliver to every socket the player holds. */
  sendToPlayer(code: string, playerId: string, message: ServerMessage): void;

  /** Deliver one identical message to everyone in the room. */
  sendToRoom(code: string, message: ServerMessage): void;

  /**
   * Deliver a per-recipient message to everyone in the room. Snapshots and
   * round starts differ per player, so they cannot be a single broadcast.
   * Returning undefined skips that player.
   */
  sendPerPlayer(code: string, build: (playerId: string) => ServerMessage | undefined): void;

  /** Players with at least one live socket in this room. */
  playersIn(code: string): Set<string>;
}
