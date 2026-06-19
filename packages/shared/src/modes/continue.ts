import type { GameConfig, Melody, Note } from "../types";
import { validateNotes } from "../schemas";
import type { GameMode, RoundContext } from "./types";

/**
 * Fixed-step rotation: in round `r` player `i` works on song `(i + r) % n`. A
 * derangement for every round 1..n-1, visiting each song exactly once over n
 * rounds. Shared by both built-in modes.
 */
export function rotate(playerIndex: number, round: number, n: number): number {
  return (playerIndex + round) % n;
}

/**
 * The read-only context for `continue` mode: the last measure of the assigned
 * song's current tail, normalized so step indices run 0..stepsPerMeasure-1.
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
        length: Math.min(note.length, config.stepsPerMeasure - (note.start - lastMeasureStart)),
      });
    }
  }
  return context;
}

/** "Continue the Melody": each turn appends `measuresPerTurn` new measures. */
export const continueMode: GameMode = {
  id: "continue",
  name: "Continue the Melody",
  description:
    "Telephone with melodies: extend the tune from only the previous player's last measure.",
  totalRounds: (playerCount) => playerCount,
  assign: rotate,
  roleForRound: () => null,
  buildContext: (song, _round, config): RoundContext => ({
    kind: "trailing-measure",
    notes: lastMeasureContext(song, config),
  }),
  turnSteps: (config) => config.stepsPerMeasure * config.measuresPerTurn,
  validateTurn: (notes, _round, config) => validateNotes(notes, config),
};
