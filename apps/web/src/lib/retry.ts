const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

/** After this many consecutive failures, stop and tell the player. */
export const MAX_RETRIES = 8;

/**
 * Delay before retry `attempt` (0-based): doubling, capped, with jitter.
 *
 * The client used to retry every 1.5s forever. After a server restart every
 * client's playerId is unknown, so the server refused each attempt and every
 * stale tab hammered it as it came back up — exactly when it could least afford
 * it. Backing off spreads that out, and the jitter stops a roomful of clients,
 * all knocked offline by the same event, from retrying in lockstep.
 */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const backoff = Math.min(FIRST_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
  return Math.round(backoff * (0.5 + random() * 0.5));
}
