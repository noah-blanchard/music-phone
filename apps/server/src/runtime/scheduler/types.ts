import type { TimerKey } from "../../game/effects";

/**
 * Deferred work for a room: the round clock, the disconnect grace window and
 * the empty-room reaper.
 *
 * Timers are addressed by (room code, key) and are idempotent — scheduling over
 * an existing key replaces it, so a round that ends early and immediately arms
 * the next one cannot leave two clocks running.
 *
 * Behind an interface because a single instance can hold these in memory, while
 * several instances would need whichever one owns the room to hold a lease.
 */
export interface RoundScheduler {
  /** Run `task` at epoch-ms `at`, replacing any timer under this key. */
  schedule(code: string, key: TimerKey, at: number, task: () => void): void;

  cancel(code: string, key: TimerKey): void;

  /** Cancel every timer for a room, e.g. when it is destroyed. */
  cancelRoom(code: string): void;

  /** Cancel everything, e.g. on shutdown. */
  cancelAll(): void;
}
