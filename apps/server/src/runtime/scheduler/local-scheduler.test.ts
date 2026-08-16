import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalScheduler } from "./local-scheduler";

let scheduler: LocalScheduler;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  scheduler = new LocalScheduler();
});

afterEach(() => {
  scheduler.cancelAll();
  vi.useRealTimers();
});

const at = (msFromNow: number) => Date.now() + msFromNow;

describe("LocalScheduler", () => {
  it("runs a task at its deadline, not before", () => {
    const task = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), task);

    vi.advanceTimersByTime(999);
    expect(task).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs a deadline that has already passed on the next tick rather than dropping it", () => {
    const task = vi.fn();
    scheduler.schedule("ABCD", "round", at(-60_000), task);

    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("replaces a timer scheduled under the same key", () => {
    const first = vi.fn();
    const second = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), first);
    scheduler.schedule("ABCD", "round", at(5000), second);

    vi.advanceTimersByTime(5000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys in the same room independent", () => {
    const round = vi.fn();
    const grace = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), round);
    scheduler.schedule("ABCD", "grace:alice", at(2000), grace);

    vi.advanceTimersByTime(1000);
    expect(round).toHaveBeenCalledTimes(1);
    expect(grace).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(grace).toHaveBeenCalledTimes(1);
  });

  it("keeps the same key in different rooms independent", () => {
    const here = vi.fn();
    const there = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), here);
    scheduler.schedule("WXYZ", "round", at(1000), there);

    vi.advanceTimersByTime(1000);
    expect(here).toHaveBeenCalledTimes(1);
    expect(there).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending timer", () => {
    const task = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), task);
    scheduler.cancel("ABCD", "round");

    vi.advanceTimersByTime(10_000);
    expect(task).not.toHaveBeenCalled();
  });

  it("tolerates cancelling something that was never scheduled", () => {
    expect(() => scheduler.cancel("ABCD", "round")).not.toThrow();
    expect(() => scheduler.cancelRoom("NOPE")).not.toThrow();
  });

  it("cancels every timer in one room without touching another", () => {
    const doomed = vi.fn();
    const spared = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), doomed);
    scheduler.schedule("ABCD", "reap", at(1000), doomed);
    scheduler.schedule("WXYZ", "round", at(1000), spared);

    scheduler.cancelRoom("ABCD");
    vi.advanceTimersByTime(1000);

    expect(doomed).not.toHaveBeenCalled();
    expect(spared).toHaveBeenCalledTimes(1);
  });

  it("cancels everything on shutdown", () => {
    const task = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), task);
    scheduler.schedule("WXYZ", "reap", at(1000), task);

    scheduler.cancelAll();
    vi.advanceTimersByTime(10_000);
    expect(task).not.toHaveBeenCalled();
  });

  it("lets a task re-arm its own key — the round-after-round case", () => {
    // A round ending schedules the next round under the same key. Clearing the
    // handle before running is what stops that new timer being cancelled.
    const runs: number[] = [];
    const arm = (n: number) => {
      scheduler.schedule("ABCD", "round", at(1000), () => {
        runs.push(n);
        if (n < 3) arm(n + 1);
      });
    };
    arm(1);

    vi.advanceTimersByTime(3000);
    expect(runs).toEqual([1, 2, 3]);
  });

  it("does not fire a task twice", () => {
    const task = vi.fn();
    scheduler.schedule("ABCD", "round", at(1000), task);
    vi.advanceTimersByTime(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
