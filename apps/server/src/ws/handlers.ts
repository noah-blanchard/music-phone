import { parseClientMessage } from "@musicphone/shared";
import type { Command } from "../game/commands";

/**
 * Turn a raw inbound WebSocket payload into a command.
 *
 * `playerId` comes from the connection, never from the message body, so a
 * client cannot act on another player's behalf by claiming their id.
 *
 * Returns null for anything unparseable, which the caller drops silently — a
 * malformed frame is not worth a round trip. `raw` may arrive as a string or as
 * an already-parsed object depending on the socket's schema; both are handled.
 */
export function toCommand(raw: unknown, playerId: string): Command | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const message = parseClientMessage(data);
  if (!message) return null;

  switch (message.type) {
    case "game:start":
      return { type: "game:start", playerId };
    case "config:update":
      return { type: "config:update", playerId, config: message.config };
    case "turn:autosave":
      return {
        type: "turn:autosave",
        playerId,
        notes: message.notes,
        instrumentId: message.instrumentId,
      };
    case "turn:submit":
      return {
        type: "turn:submit",
        playerId,
        notes: message.notes,
        instrumentId: message.instrumentId,
      };
    case "player:ready":
      return { type: "player:ready", playerId, ready: message.ready };
    case "reveal:update":
      return {
        type: "reveal:update",
        playerId,
        activeSong: message.activeSong,
        revealedLayers: message.revealedLayers,
        playing: message.playing,
      };
    case "room:leave":
      return { type: "player:left", playerId };
  }
}
