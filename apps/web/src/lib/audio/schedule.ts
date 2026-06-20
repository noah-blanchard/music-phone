import { loopSteps, roleOfSegment, type GameConfig, type Layer, type Melody } from "@musicphone/shared";

/**
 * Turn a song into stacked playback layers (all over the same
 * loop). `limit`, if given, keeps only the first N layers — used by the results
 * reveal to progressively unveil the arrangement.
 */
export function stackLayers(melody: Melody, limit?: number): Layer[] {
  const segments = limit == null ? melody.segments : melody.segments.slice(0, limit);
  return segments.map((seg) => ({
    roleId: roleOfSegment(seg.order, seg.roleId)?.id ?? seg.roleId ?? "",
    instrumentId: seg.instrumentId,
    notes: seg.notes,
  }));
}

/** Length of one loop in steps (layers mode). */
export function loopLength(config: GameConfig): number {
  return loopSteps(config);
}
