import type { TimerKey } from "../../game/effects";
import type { RoundScheduler } from "./types";

/**
 * setTimeout-backed scheduler for a single instance.
 *
 * Delays are computed from an absolute epoch-ms deadline rather than stored as
 * durations, so a timer re-armed after a restart fires at the time the round
 * was actually due to end. A deadline already in the past fires on the next
 * tick instead of being lost.
 */
export class LocalScheduler implements RoundScheduler {
  private timers = new Map<string, Map<TimerKey, ReturnType<typeof setTimeout>>>();

  schedule(code: string, key: TimerKey, at: number, task: () => void): void {
    this.cancel(code, key);

    let room = this.timers.get(code);
    if (!room) {
      room = new Map();
      this.timers.set(code, room);
    }

    const delay = Math.max(0, at - Date.now());
    const handle = setTimeout(() => {
      // Clear before running: the task usually schedules the next timer under
      // the same key, and must not have it cancelled from under it.
      this.forget(code, key);
      task();
    }, delay);

    room.set(key, handle);
  }

  cancel(code: string, key: TimerKey): void {
    const handle = this.timers.get(code)?.get(key);
    if (handle === undefined) return;
    clearTimeout(handle);
    this.forget(code, key);
  }

  cancelRoom(code: string): void {
    const room = this.timers.get(code);
    if (!room) return;
    for (const handle of room.values()) clearTimeout(handle);
    this.timers.delete(code);
  }

  cancelAll(): void {
    for (const code of [...this.timers.keys()]) this.cancelRoom(code);
  }

  private forget(code: string, key: TimerKey): void {
    const room = this.timers.get(code);
    if (!room) return;
    room.delete(key);
    if (room.size === 0) this.timers.delete(code);
  }
}
