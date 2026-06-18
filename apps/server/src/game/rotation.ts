import type { GameConfig, Melody, Note } from "@musicphone/shared";

/**
 * Rotation assignment. With N players and N melodies, in round `r` the player at
 * index `i` works on melody index `(i + r) % N`. This is a fixed-step rotation:
 * it is a derangement for every round 1..N-1 (nobody gets their own seed back)
 * and each player touches each melody exactly once across the N rounds.
 */
export function melodyIndexForPlayer(playerIndex: number, round: number, n: number): number {
  return (playerIndex + round) % n;
}

/**
 * Extract the read-only context shown to a player at the start of a round: the
 * last measure of the melody assigned to them, normalized so step indices run
 * 0..stepsPerMeasure-1. Returns an empty array for seed melodies (round 0) or if
 * the last segment placed nothing in its final measure.
 */
export function lastMeasureContext(melody: Melody, config: GameConfig): Note[] {
  const last = melody.segments[melody.segments.length - 1];
  if (!last) return [];

  const lastMeasureStart = (config.measuresPerTurn - 1) * config.stepsPerMeasure;
  const context: Note[] = [];
  for (const note of last.notes) {
    if (note.start >= lastMeasureStart) {
      context.push({
        ...note,
        start: note.start - lastMeasureStart,
        // Clamp length so the context note cannot overflow the single measure.
        length: Math.min(note.length, config.stepsPerMeasure - (note.start - lastMeasureStart)),
      });
    }
  }
  return context;
}
