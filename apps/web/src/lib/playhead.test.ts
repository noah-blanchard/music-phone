import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayhead } from "./playhead";

/**
 * Drives requestAnimationFrame by hand so the coalescing is observable: nothing
 * reaches subscribers until a frame is run.
 */
function withFrames() {
  const pending: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    pending.push(fn);
    return pending.length;
  });
  return {
    runFrame: () => {
      const queued = pending.splice(0, pending.length);
      for (const fn of queued) fn();
    },
    pendingCount: () => pending.length,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("createPlayhead", () => {
  it("gives a new subscriber the current step immediately", () => {
    withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];

    playhead.subscribe((step) => seen.push(step));

    expect(seen).toEqual([null]);
  });

  it("publishes the step on the next frame", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    playhead.subscribe((step) => seen.push(step));

    playhead.set(4);
    expect(seen).toEqual([null]);

    frames.runFrame();
    expect(seen).toEqual([null, 4]);
  });

  it("coalesces a burst of steps into a single frame carrying the last one", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    playhead.subscribe((step) => seen.push(step));

    playhead.set(1);
    playhead.set(2);
    playhead.set(3);
    expect(frames.pendingCount()).toBe(1);

    frames.runFrame();
    expect(seen).toEqual([null, 3]);
  });

  it("ignores a repeat of the step already published", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    playhead.subscribe((step) => seen.push(step));

    playhead.set(7);
    frames.runFrame();
    playhead.set(7);

    expect(frames.pendingCount()).toBe(0);
    expect(seen).toEqual([null, 7]);
  });

  it("publishes null when playback stops", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    playhead.subscribe((step) => seen.push(step));

    playhead.set(9);
    frames.runFrame();
    playhead.set(null);
    frames.runFrame();

    expect(seen).toEqual([null, 9, null]);
  });

  it("stops calling a listener once it unsubscribes", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    const unsubscribe = playhead.subscribe((step) => seen.push(step));

    unsubscribe();
    playhead.set(2);
    frames.runFrame();

    expect(seen).toEqual([null]);
  });

  it("fans out to every subscriber", () => {
    const frames = withFrames();
    const playhead = createPlayhead();
    const a: (number | null)[] = [];
    const b: (number | null)[] = [];
    playhead.subscribe((step) => a.push(step));
    playhead.subscribe((step) => b.push(step));

    playhead.set(5);
    frames.runFrame();

    expect(a).toEqual([null, 5]);
    expect(b).toEqual([null, 5]);
  });

  it("publishes synchronously where there are no frames (server render)", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const playhead = createPlayhead();
    const seen: (number | null)[] = [];
    playhead.subscribe((step) => seen.push(step));

    playhead.set(3);

    expect(seen).toEqual([null, 3]);
  });
});
