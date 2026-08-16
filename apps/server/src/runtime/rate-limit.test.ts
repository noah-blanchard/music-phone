import { describe, expect, it } from "vitest";
import { RateLimiter, clientKey } from "./rate-limit";

/** A limiter with a clock the test drives by hand. */
function limiter(options: { capacity: number; refillPerSecond: number; idleMs?: number }) {
  let now = 1_000_000;
  const instance = new RateLimiter(options, () => now);
  return {
    instance,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("RateLimiter", () => {
  it("allows a full burst then refuses", () => {
    const { instance } = limiter({ capacity: 3, refillPerSecond: 1 });
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(false);
  });

  it("refills steadily rather than on a window boundary", () => {
    const { instance, advance } = limiter({ capacity: 2, refillPerSecond: 1 });
    instance.tryConsume("ip");
    instance.tryConsume("ip");
    expect(instance.tryConsume("ip")).toBe(false);

    advance(500); // half a token
    expect(instance.tryConsume("ip")).toBe(false);

    advance(500); // a whole one
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(false);
  });

  it("never refills past its capacity", () => {
    const { instance, advance } = limiter({ capacity: 2, refillPerSecond: 10 });
    advance(60_000);
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(true);
    expect(instance.tryConsume("ip")).toBe(false);
  });

  it("keeps callers independent", () => {
    const { instance } = limiter({ capacity: 1, refillPerSecond: 1 });
    expect(instance.tryConsume("a")).toBe(true);
    expect(instance.tryConsume("a")).toBe(false);
    expect(instance.tryConsume("b")).toBe(true);
  });

  it("supports a cost greater than one", () => {
    const { instance } = limiter({ capacity: 10, refillPerSecond: 1 });
    expect(instance.tryConsume("ip", 8)).toBe(true);
    expect(instance.tryConsume("ip", 8)).toBe(false);
    expect(instance.tryConsume("ip", 2)).toBe(true);
  });

  it("refuses a cost larger than the capacity outright", () => {
    const { instance } = limiter({ capacity: 5, refillPerSecond: 1 });
    expect(instance.tryConsume("ip", 6)).toBe(false);
  });

  it("forgets a key on request", () => {
    const { instance } = limiter({ capacity: 1, refillPerSecond: 1 });
    instance.tryConsume("socket");
    expect(instance.tryConsume("socket")).toBe(false);

    instance.forget("socket");
    expect(instance.tryConsume("socket")).toBe(true);
  });

  describe("prune", () => {
    it("drops buckets that refilled and went quiet", () => {
      const { instance, advance } = limiter({ capacity: 2, refillPerSecond: 1, idleMs: 1000 });
      instance.tryConsume("ip");
      expect(instance.size).toBe(1);

      advance(5000); // long enough to refill and to go idle
      instance.prune();
      expect(instance.size).toBe(0);
    });

    it("keeps a bucket that is still throttled", () => {
      const { instance, advance } = limiter({ capacity: 5, refillPerSecond: 0.01, idleMs: 1000 });
      instance.tryConsume("ip", 5);

      advance(5000); // idle, but nowhere near refilled
      instance.prune();
      expect(instance.size).toBe(1);
    });

    it("keeps a bucket that is full but recently used", () => {
      const { instance, advance } = limiter({ capacity: 2, refillPerSecond: 100, idleMs: 10_000 });
      instance.tryConsume("ip");
      advance(100);
      instance.prune();
      expect(instance.size).toBe(1);
    });
  });

  it("sustains a steady rate indefinitely without throttling", () => {
    // Ten messages a second against a ten-per-second refill must never trip.
    const { instance, advance } = limiter({ capacity: 40, refillPerSecond: 10 });
    for (let i = 0; i < 500; i++) {
      expect(instance.tryConsume("socket"), `message ${i}`).toBe(true);
      advance(100);
    }
  });

  it("throttles a flood well before it reaches the room", () => {
    const { instance } = limiter({ capacity: 40, refillPerSecond: 10 });
    let allowed = 0;
    for (let i = 0; i < 10_000; i++) if (instance.tryConsume("socket")) allowed++;
    expect(allowed).toBe(40);
  });
});

describe("clientKey", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://localhost/rooms", { headers });

  it("prefers the first entry of X-Forwarded-For", () => {
    expect(clientKey(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "10.0.0.1")).toBe(
      "203.0.113.7",
    );
  });

  it("trims whitespace around the address", () => {
    expect(clientKey(request({ "x-forwarded-for": "  203.0.113.7 " }))).toBe("203.0.113.7");
  });

  it("falls back to the socket address when there is no proxy header", () => {
    expect(clientKey(request(), "198.51.100.4")).toBe("198.51.100.4");
  });

  it("falls back to a shared key when nothing identifies the caller", () => {
    // Collective throttling beats no throttling.
    expect(clientKey(request())).toBe("unknown");
  });

  it("ignores an empty X-Forwarded-For", () => {
    expect(clientKey(request({ "x-forwarded-for": "" }), "198.51.100.4")).toBe("198.51.100.4");
  });
});
