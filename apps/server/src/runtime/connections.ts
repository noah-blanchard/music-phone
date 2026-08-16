import type { ServerMessage } from "@musicphone/shared";
import type { RoomBus } from "./bus/types";

/** One live WebSocket, owned by this server instance. */
export interface Connection {
  /** Unique per socket, not per player — a player may hold several. */
  id: string;
  code: string;
  playerId: string;
  send: (message: ServerMessage) => void;
}

/**
 * The live sockets this instance is holding.
 *
 * Keyed by connection id rather than by player id, which matters more than it
 * looks. A player legitimately holds more than one socket at a time: opening a
 * second tab, and — far more commonly — reconnecting, because the new socket
 * usually completes its upgrade before the old one's close frame arrives.
 *
 * Keying by player made those two sockets the same entry, so the *newer*
 * connection was evicted when the *older* one closed. The player was then
 * holding an open socket the server would never send to again, and in the lobby
 * the disconnect grace timer removed them outright a few seconds later.
 *
 * Here, closing a socket removes exactly that socket. A player counts as
 * connected while any of their sockets is live, so the ordering no longer
 * matters.
 */
export class ConnectionRegistry implements RoomBus {
  private byId = new Map<string, Connection>();
  /** code -> connection ids, so room fan-out does not scan every socket. */
  private byRoom = new Map<string, Set<string>>();

  add(connection: Connection): void {
    // Defensive: a re-used id would otherwise orphan the previous entry.
    if (this.byId.has(connection.id)) this.remove(connection.id);

    this.byId.set(connection.id, connection);
    let room = this.byRoom.get(connection.code);
    if (!room) {
      room = new Set();
      this.byRoom.set(connection.code, room);
    }
    room.add(connection.id);
  }

  /** Drop one socket. Returns it, so the caller can see who it belonged to. */
  remove(connectionId: string): Connection | undefined {
    const connection = this.byId.get(connectionId);
    if (!connection) return undefined;

    this.byId.delete(connectionId);
    const room = this.byRoom.get(connection.code);
    if (room) {
      room.delete(connectionId);
      if (room.size === 0) this.byRoom.delete(connection.code);
    }
    return connection;
  }

  /** Whether this player still holds at least one live socket. */
  hasPlayer(code: string, playerId: string): boolean {
    for (const id of this.byRoom.get(code) ?? []) {
      if (this.byId.get(id)?.playerId === playerId) return true;
    }
    return false;
  }

  /** Every player with at least one live socket in this room. */
  playersIn(code: string): Set<string> {
    const players = new Set<string>();
    for (const id of this.byRoom.get(code) ?? []) {
      const connection = this.byId.get(id);
      if (connection) players.add(connection.playerId);
    }
    return players;
  }

  /** Deliver to every socket this player holds. */
  sendToPlayer(code: string, playerId: string, message: ServerMessage): void {
    for (const id of this.byRoom.get(code) ?? []) {
      const connection = this.byId.get(id);
      if (connection?.playerId === playerId) connection.send(message);
    }
  }

  /** Deliver to every socket in the room. */
  sendToRoom(code: string, message: ServerMessage): void {
    for (const id of this.byRoom.get(code) ?? []) {
      this.byId.get(id)?.send(message);
    }
  }

  /**
   * Deliver a per-player message to everyone in the room. Used for snapshots
   * and round starts, which differ per recipient.
   */
  sendPerPlayer(code: string, build: (playerId: string) => ServerMessage | undefined): void {
    // Build once per player, not once per socket: a player with two tabs should
    // see the same thing in both.
    for (const playerId of this.playersIn(code)) {
      const message = build(playerId);
      if (message) this.sendToPlayer(code, playerId, message);
    }
  }

  /** Number of live sockets in a room. */
  size(code: string): number {
    return this.byRoom.get(code)?.size ?? 0;
  }
}
