import type { Room } from "@musicphone/shared";
import type { RoomStore, VersionedRoom } from "./types";

/**
 * In-memory RoomStore.
 *
 * Used by the tests, and as the fallback when no Redis URL is configured so the
 * game still runs locally with nothing else installed. Rooms do not survive a
 * restart here — that is what the Redis store is for.
 *
 * Rooms are cloned on the way in and out so a caller holding a returned room
 * cannot mutate what is stored, matching how a serializing store behaves.
 */
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, VersionedRoom>();

  async load(code: string): Promise<VersionedRoom | undefined> {
    const entry = this.rooms.get(code);
    if (!entry) return undefined;
    return { room: structuredClone(entry.room), version: entry.version };
  }

  async create(room: Room): Promise<boolean> {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, { room: structuredClone(room), version: 1 });
    return true;
  }

  async save(room: Room, expectedVersion: number): Promise<number | undefined> {
    const entry = this.rooms.get(room.code);
    if (!entry || entry.version !== expectedVersion) return undefined;
    const version = expectedVersion + 1;
    this.rooms.set(room.code, { room: structuredClone(room), version });
    return version;
  }

  async delete(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async codes(): Promise<string[]> {
    return [...this.rooms.keys()];
  }
}
