import type { GameConfig } from "@musicphone/shared";

/**
 * Everything that can change a room.
 *
 * Client intents arrive already parsed by `parseClientMessage` and attributed
 * to the player whose connection carried them — the reducer never sees a raw
 * payload, and never has to trust a playerId that came from inside a message
 * body. The remaining commands are raised by the runtime itself: connection
 * lifecycle, and timers firing.
 */
export type Command =
  /** A socket for this player became live. */
  | { type: "player:connected"; playerId: string }
  /** This player's last live socket went away. */
  | { type: "player:disconnected"; playerId: string }
  /** The disconnect grace window expired without a reconnect. */
  | { type: "player:grace-expired"; playerId: string }
  /** The player explicitly asked to leave. */
  | { type: "player:left"; playerId: string }
  | { type: "game:start"; playerId: string }
  | { type: "config:update"; playerId: string; config: Partial<GameConfig> }
  | { type: "turn:autosave"; playerId: string; notes: unknown; instrumentId?: string }
  | { type: "turn:submit"; playerId: string; notes: unknown; instrumentId?: string }
  | { type: "player:ready"; playerId: string; ready: boolean }
  | { type: "turn:reroll"; playerId: string }
  | {
      type: "reveal:update";
      playerId: string;
      activeSong: number;
      revealedLayers: number;
      playing: boolean;
    }
  /**
   * The round clock ran out. Carries the round it was armed for so a timer that
   * survives an early advance cannot end the wrong round.
   */
  | { type: "round:timeout"; round: number }
  /** The room has been empty long enough to collect. */
  | { type: "room:reap" };

export type CommandType = Command["type"];
