import { describe, expect, it } from "vitest";
import { retryDelay } from "./retry";

/** Jitter removed, so the underlying schedule is what is being asserted. */
const noJitter = () => 1;
const maxJitter = () => 0;

describe("retryDelay", () => {
  it("starts small so a brief blip recovers almost immediately", () => {
    expect(retryDelay(0, noJitter)).toBe(500);
  });

  it("doubles with each failure", () => {
    expect(retryDelay(1, noJitter)).toBe(1000);
    expect(retryDelay(2, noJitter)).toBe(2000);
    expect(retryDelay(3, noJitter)).toBe(4000);
  });

  it("caps out rather than growing without bound", () => {
    expect(retryDelay(10, noJitter)).toBe(30_000);
    expect(retryDelay(50, noJitter)).toBe(30_000);
  });

  it("stays finite for absurd attempt counts", () => {
    expect(Number.isFinite(retryDelay(2000, noJitter))).toBe(true);
  });

  it("applies jitter between half and full delay", () => {
    // A roomful of clients kicked off by one restart must not retry in lockstep.
    expect(retryDelay(3, maxJitter)).toBe(2000);
    expect(retryDelay(3, noJitter)).toBe(4000);
  });

  it("never returns a delay that would busy-loop", () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const random of [maxJitter, noJitter, () => 0.5]) {
        expect(retryDelay(attempt, random)).toBeGreaterThanOrEqual(250);
      }
    }
  });

  it("is non-decreasing as failures mount, for a fixed jitter", () => {
    let previous = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      const delay = retryDelay(attempt, () => 0.5);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  it("spreads a hundred clients across a wide window", () => {
    const delays = Array.from({ length: 100 }, () => retryDelay(5));
    expect(new Set(delays).size).toBeGreaterThan(50);
  });
});
