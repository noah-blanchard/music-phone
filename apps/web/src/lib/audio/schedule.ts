import { stepsPerTurn, type GameConfig, type Melody, type Note } from "@musicphone/shared";

/**
 * Flatten a finished melody into a single list of notes with absolute step
 * positions, offsetting each segment by its turn length. Useful for results
 * playback where the whole 4*N-measure piece plays end to end.
 */
export function flattenMelody(melody: Melody, config: GameConfig): Note[] {
  const turn = stepsPerTurn(config);
  const out: Note[] = [];
  for (const segment of melody.segments) {
    const offset = segment.order * turn;
    for (const note of segment.notes) {
      out.push({ ...note, start: note.start + offset });
    }
  }
  return out;
}

/** Total number of steps a finished melody spans. */
export function melodySteps(melody: Melody, config: GameConfig): number {
  return Math.max(1, melody.segments.length) * stepsPerTurn(config);
}
