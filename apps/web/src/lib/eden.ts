import { treaty } from "@elysiajs/eden";
import type { App } from "@musicphone/server";
import type { GameConfig } from "@musicphone/shared";

/**
 * End-to-end typed HTTP client (Eden Treaty). Only the server's `App` *type* is
 * imported — `import type` is erased at build time, so the Bun/Elysia server code
 * never enters the browser bundle. Realtime gameplay uses the WebSocket in ws.ts.
 */

/**
 * Base URL of the game server.
 *
 * NEXT_PUBLIC_ values are inlined at build time, so forgetting to set this in
 * the deployment environment used to produce a production bundle that quietly
 * pointed at localhost:3001 — working perfectly for whoever built it and for
 * nobody else. A missing value is now a build failure rather than a runtime
 * mystery; only development falls back.
 */
function resolveServerUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SERVER_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SERVER_URL is not set. Point it at the game server before building for production.",
    );
  }
  return "http://localhost:3001";
}

export const SERVER_URL = resolveServerUrl();

export const api = treaty<App>(SERVER_URL);

/** Derive the WebSocket base URL from the HTTP server URL. */
export function wsUrl(): string {
  return SERVER_URL.replace(/^http/, "ws");
}

export interface RoomCredentials {
  code: string;
  playerId: string;
}

/** Pull the server's own message out of an error response, if it sent one. */
function serverMessage(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "error" in value
    ? ((value as { error?: unknown }).error as string | undefined)
    : undefined;
}

export async function createRoom(
  nickname: string,
  config?: Partial<
    Pick<GameConfig, "barsPerSong" | "contextVisibility" | "selectedRoles" | "roundDurationSec">
  >,
): Promise<RoomCredentials> {
  const { data, error } = await api.rooms.post({ nickname, config });
  // Surface the server's wording — notably the rate-limit message, which tells
  // the player to wait rather than leaving them to guess.
  if (error) throw new Error(serverMessage(error.value) ?? "Could not create room");
  if (!data || "error" in data) {
    throw new Error(serverMessage(data) ?? "Could not create room");
  }
  return data;
}

export async function joinRoom(code: string, nickname: string): Promise<RoomCredentials> {
  const { data, error } = await api.rooms({ code }).join.post({ nickname });
  if (error) throw new Error(serverMessage(error.value) ?? "Could not join room");
  if (!data || "error" in data) throw new Error(serverMessage(data) ?? "Could not join room");
  return data;
}
