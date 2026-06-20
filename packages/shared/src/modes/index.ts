import type { GameModeId } from "../types";
import type { GameMode } from "./types";
import { continueMode } from "./continue";
import { layersMode } from "./layers";

export * from "./types";
export { rotate, lastMeasureContext } from "./continue";
export { LAYER_ROLES, MAX_DRUM_VOICES, getRole, roleOfSegment } from "./layers";

/** Registry of all game modes. Add a mode = add a module + an entry here. */
export const MODES: Record<GameModeId, GameMode> = {
  continue: continueMode,
  layers: layersMode,
};

/** Ordered list for menus (layers first — it is the default). */
export const MODE_LIST: GameMode[] = [layersMode, continueMode];

/** Look up a mode, falling back to the default ("layers") for unknown ids. */
export function getMode(id: GameModeId | string | undefined): GameMode {
  return MODES[(id as GameModeId)] ?? MODES.layers;
}
