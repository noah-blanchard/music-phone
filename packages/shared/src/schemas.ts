import type { ClientMessage } from "./messages";
import { MAX_BARS_PER_SONG, MIN_BARS_PER_SONG, type GameConfig, type Note } from "./types";

/**
 * Lightweight runtime validation for untrusted inbound WebSocket payloads.
 * Kept dependency-free (no zod) so the shared package stays portable between
 * the Bun server and the Next.js client. Note payloads are validated per-role
 * by the active game mode's `validateTurn`.
 */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);
}

/** Accept a short sound-id string (instrument or kit), else undefined. */
function cleanInstrumentId(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 && v.length <= 40 ? v : undefined;
}

/**
 * Parse an inbound client message. Returns the typed message or null if the
 * shape is invalid. Note payloads are validated separately by handlers, which
 * have access to the room's config.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isObject(raw) || typeof raw.type !== "string") return null;
  switch (raw.type) {
    case "game:start":
    case "room:leave":
      return { type: raw.type };
    case "player:ready":
      return typeof raw.ready === "boolean" ? { type: "player:ready", ready: raw.ready } : null;
    case "config:update":
      return isObject(raw.config)
        ? { type: "config:update", config: raw.config as Partial<GameConfig> }
        : null;
    case "turn:autosave":
      return Array.isArray(raw.notes)
        ? { type: "turn:autosave", notes: raw.notes as Note[], instrumentId: cleanInstrumentId(raw.instrumentId) }
        : null;
    case "turn:submit":
      return Array.isArray(raw.notes)
        ? { type: "turn:submit", notes: raw.notes as Note[], instrumentId: cleanInstrumentId(raw.instrumentId) }
        : null;
    case "reveal:update":
      return isFiniteInt(raw.activeSong) &&
        isFiniteInt(raw.revealedLayers) &&
        typeof raw.playing === "boolean"
        ? {
            type: "reveal:update",
            activeSong: raw.activeSong,
            revealedLayers: raw.revealedLayers,
            playing: raw.playing,
          }
        : null;
    default:
      return null;
  }
}

/** Clamp a partial config update into safe bounds. */
export function sanitizeConfig(patch: Partial<GameConfig>, base: GameConfig): GameConfig {
  const next: GameConfig = { ...base };
  if (patch.mode === "layers") next.mode = patch.mode;
  if (isFiniteInt(patch.bpm)) next.bpm = Math.min(240, Math.max(40, patch.bpm));
  if (isFiniteInt(patch.root)) next.root = Math.min(84, Math.max(48, patch.root));
  if (patch.scale === "major" || patch.scale === "minor" || patch.scale === "pentatonic") {
    next.scale = patch.scale;
  }
  if (isFiniteInt(patch.barsPerSong)) {
    next.barsPerSong = Math.min(MAX_BARS_PER_SONG, Math.max(MIN_BARS_PER_SONG, patch.barsPerSong));
  }
  if (
    patch.contextVisibility === "previous" ||
    patch.contextVisibility === "all" ||
    patch.contextVisibility === "blind"
  ) {
    next.contextVisibility = patch.contextVisibility;
  }
  if (isFiniteInt(patch.roundDurationSec)) {
    next.roundDurationSec = Math.min(600, Math.max(30, patch.roundDurationSec));
  }
  return next;
}
