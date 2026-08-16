export interface RateLimitOptions {
  /** Largest burst allowed before throttling kicks in. */
  capacity: number;
  /** Tokens replenished per second. */
  refillPerSecond: number;
  /**
   * A bucket that has been full and untouched for this long is forgotten, so
   * keys cannot accumulate for the lifetime of the process.
   */
  idleMs?: number;
}

interface Bucket {
  tokens: number;
  updated: number;
}

const DEFAULT_IDLE_MS = 10 * 60_000;

/**
 * Token-bucket rate limiter keyed by caller.
 *
 * Nothing on this server was throttled: room creation is unauthenticated and
 * allocates state, and a socket could put an O(players) snapshot broadcast on
 * the wire for every message it sent. Both are cheap to abuse and expensive to
 * serve.
 *
 * A bucket refills continuously rather than resetting on a window boundary, so
 * normal play — which is bursty, especially autosaves while someone drags a
 * note — is never caught out by where a fixed window happens to fall.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly idleMs: number;

  constructor(
    private readonly options: RateLimitOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  }

  /**
   * Bring a bucket up to date. Tokens accrue with elapsed time rather than
   * being added on a schedule, so this must run before anything reads them.
   */
  private refill(bucket: Bucket, now: number): void {
    const elapsedSeconds = Math.max(0, now - bucket.updated) / 1000;
    bucket.tokens = Math.min(
      this.options.capacity,
      bucket.tokens + elapsedSeconds * this.options.refillPerSecond,
    );
    bucket.updated = now;
  }

  /** Take `cost` tokens if available. Returns false when the caller is over. */
  tryConsume(key: string, cost = 1): boolean {
    const now = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.options.capacity, updated: now };
    this.refill(bucket, now);

    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;

    this.buckets.set(key, bucket);
    return allowed;
  }

  /** Forget a key outright, e.g. when its socket closes. */
  forget(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Drop buckets that have refilled completely and gone quiet. A throttled
   * caller is kept, so going silent is never a way to clear a penalty.
   */
  prune(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      const idleFor = now - bucket.updated;
      // Check against the tokens the bucket *would* have now, not the stale
      // count from its last use.
      this.refill(bucket, now);
      if (bucket.tokens >= this.options.capacity && idleFor > this.idleMs) {
        this.buckets.delete(key);
      }
    }
  }

  /** Number of tracked keys. Exposed for tests and diagnostics. */
  get size(): number {
    return this.buckets.size;
  }
}

/**
 * Best-effort client address.
 *
 * Traefik — like any reverse proxy — puts the real client first in
 * X-Forwarded-For; the socket address there is the proxy's and would lump every
 * caller into one bucket. Falls back to the socket address, then to a shared
 * key — which throttles collectively rather than not at all.
 */
export function clientKey(request: Request, socketAddress?: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || socketAddress || "unknown";
}
