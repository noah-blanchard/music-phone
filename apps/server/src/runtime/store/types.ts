import type { Room } from "@musicphone/shared";

/** A room together with the revision it was read at. */
export interface VersionedRoom {
  room: Room;
  version: number;
}

/**
 * Where rooms live.
 *
 * Every write is guarded by the version the caller read, so two writers racing
 * on the same room cannot silently lose one another's changes — the loser is
 * told to re-read and retry. That guard is unnecessary while a single instance
 * owns every room, and is exactly what makes running several instances possible
 * later without revisiting the call sites.
 */
export interface RoomStore {
  /** Read a room, or undefined if there is none under this code. */
  load(code: string): Promise<VersionedRoom | undefined>;

  /**
   * Store a brand-new room. Returns false if the code is already taken, so the
   * caller can pick another rather than overwriting a live game.
   */
  create(room: Room): Promise<boolean>;

  /**
   * Write a room back if it is still at `expectedVersion`. Returns the new
   * version, or undefined if someone else wrote first.
   */
  save(room: Room, expectedVersion: number): Promise<number | undefined>;

  delete(code: string): Promise<void>;

  /** Every room code currently stored — used to re-arm round timers on boot. */
  codes(): Promise<string[]>;
}
