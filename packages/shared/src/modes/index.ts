import type { GameModeId } from "../types";
import type { GameMode } from "./types";
import { layersMode } from "./layers";

export * from "./types";
export { LAYER_ROLES, MAX_DRUM_VOICES, getRole, roleOfSegment, rotate, assignWheel } from "./layers";

/** Registry of all game modes. Add a mode = add a module + an entry here. */
export const MODES: Record<GameModeId, GameMode> = {
  layers: layersMode,
};

/** Ordered list for menus. */
export const MODE_LIST: GameMode[] = [layersMode];

/** Look up a mode, falling back to the default ("layers"). */
export function getMode(id?: GameModeId | string): GameMode {
  return MODES[(id as GameModeId)] ?? layersMode;
}
