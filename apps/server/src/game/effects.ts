import type { ServerMessage } from "@musicphone/shared";
import type { Command } from "./commands";

/**
 * What the reducer asks the runtime to do once a command has been applied.
 *
 * The reducer decides *what* should happen; the runtime owns the sockets,
 * timers and store that make it happen. Keeping the two apart is what lets the
 * game rules be tested without a network, and what lets the delivery mechanism
 * (in-process today, Redis pub/sub later) change without touching the rules.
 */
export type Effect =
  /**
   * Send every connected player a freshly sanitized snapshot. Not a plain
   * broadcast: each player's snapshot differs (it carries their own selfId, and
   * withholds melodies until the results phase).
   */
  | { type: "snapshot" }
  /** Send one identical message to every connected player. */
  | { type: "broadcast"; message: ServerMessage }
  /** Send one message to one player. */
  | { type: "send"; playerId: string; message: ServerMessage }
  /**
   * Send every connected player their own `round:started`. Per-player because
   * each one gets a different assigned song, role and context.
   */
  | { type: "announce-round" }
  /** The same, for a single player catching up after a reconnect. */
  | { type: "announce-round-to"; playerId: string }
  /**
   * Run `command` against this room at epoch-ms `at`, replacing any timer
   * already registered under `key`. Carrying the command means the scheduler
   * needs no knowledge of what it is scheduling.
   */
  | { type: "schedule"; key: TimerKey; at: number; command: Command }
  /** Cancel the timer registered under `key`, if any. */
  | { type: "cancel"; key: TimerKey }
  /** Drop the room entirely. */
  | { type: "destroy" };

export type TimerKey = string;

/** The round clock. One per room. */
export const ROUND_TIMER: TimerKey = "round";

/** Collection of an empty room. One per room. */
export const REAP_TIMER: TimerKey = "reap";

/** The disconnect grace window for a single player. */
export function graceTimer(playerId: string): TimerKey {
  return `grace:${playerId}`;
}
