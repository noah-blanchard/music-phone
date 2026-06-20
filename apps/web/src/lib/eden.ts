import { treaty } from "@elysiajs/eden";
import type { App } from "@musicphone/server";
import type { GameConfig } from "@musicphone/shared";

/**
 * End-to-end typed HTTP client (Eden Treaty). Only the server's `App` *type* is
 * imported — `import type` is erased at build time, so the Bun/Elysia server code
 * never enters the browser bundle. Realtime gameplay uses the WebSocket in ws.ts.
 */

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";

export const api = treaty<App>(SERVER_URL);

/** Derive the WebSocket base URL from the HTTP server URL. */
export function wsUrl(): string {
  return SERVER_URL.replace(/^http/, "ws");
}

export interface RoomCredentials {
  code: string;
  playerId: string;
}

export async function createRoom(
  nickname: string,
  config?: Partial<Pick<GameConfig, "barsPerSong" | "contextVisibility" | "selectedRoles" | "roundDurationSec">>,
): Promise<RoomCredentials> {
  const { data, error } = await api.rooms.post({ nickname, config });
  if (error || !data) throw new Error("Could not create room");
  return data;
}

export async function joinRoom(code: string, nickname: string): Promise<RoomCredentials> {
  const { data, error } = await api.rooms({ code }).join.post({ nickname });
  if (error) throw new Error((error.value as { error?: string })?.error ?? "Could not join room");
  if (!data || "error" in data) throw new Error("Could not join room");
  return data;
}
