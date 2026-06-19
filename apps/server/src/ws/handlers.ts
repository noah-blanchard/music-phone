import { parseClientMessage } from "@musicphone/shared";
import type { RoomManager } from "../game/room-store";

/**
 * Dispatch a raw inbound WebSocket payload to the appropriate manager action.
 * `raw` may arrive as a string (default) or pre-parsed object depending on the
 * Elysia message schema; both are handled.
 */
export function handleClientMessage(
  manager: RoomManager,
  code: string,
  playerId: string,
  raw: unknown,
): void {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
  }

  const msg = parseClientMessage(data);
  if (!msg) return;

  switch (msg.type) {
    case "game:start": {
      const error = manager.startGame(code, playerId);
      if (error) manager.send(code, playerId, { type: "error", code: "start_failed", message: error });
      break;
    }
    case "config:update":
      manager.updateConfig(code, playerId, msg.config);
      break;
    case "turn:autosave":
      manager.autosave(code, playerId, msg.notes);
      break;
    case "turn:submit":
      manager.submit(code, playerId, msg.notes);
      break;
    case "player:ready":
      manager.setReady(code, playerId, msg.ready);
      break;
    case "reveal:update":
      manager.setReveal(code, playerId, msg.songId, msg.revealedLayers, msg.playing);
      break;
    case "room:leave":
      manager.leave(code, playerId);
      break;
  }
}
