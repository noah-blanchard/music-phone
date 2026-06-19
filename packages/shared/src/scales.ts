import type { GameConfig, ScaleType } from "./types";

/**
 * Semitone interval patterns for each supported scale, relative to the root.
 * The piano roll renders exactly these pitch classes (repeated per octave),
 * so every placeable note is guaranteed to be in-scale.
 */
export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
  pentatonic: [0, 2, 4, 7, 9], // major pentatonic
};

export const SCALE_LABELS: Record<ScaleType, string> = {
  major: "Major",
  minor: "Natural Minor",
  pentatonic: "Pentatonic",
};

/** Pitch-class names for display, indexed by `pitch % 12`. */
export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/**
 * Build the ascending list of in-scale MIDI pitches for a config, spanning
 * `octaves` octaves starting at `root`. The piano roll uses the reverse of this
 * list (high pitch on top) for its rows.
 */
export function buildScalePitches(config: GameConfig): number[] {
  const intervals = SCALE_INTERVALS[config.scale];
  const pitches: number[] = [];
  for (let octave = 0; octave <= config.octaves; octave++) {
    for (const interval of intervals) {
      const pitch = config.root + octave * 12 + interval;
      pitches.push(pitch);
    }
  }
  return pitches;
}

/** True if a MIDI pitch belongs to the config's scale and visible range. */
export function isInScale(pitch: number, config: GameConfig): boolean {
  return buildScalePitches(config).includes(pitch);
}

/**
 * Every MIDI pitch (chromatic) in the visible window, ascending — from the root
 * up to `root + octaves*12`. The piano roll renders all of these as rows; the
 * in-scale ones are placeable, the rest are shown dimmed and locked.
 */
export function buildChromaticRange(config: GameConfig): number[] {
  const pitches: number[] = [];
  for (let p = config.root; p <= config.root + config.octaves * 12; p++) {
    pitches.push(p);
  }
  return pitches;
}

/** True if a MIDI pitch is a black key (sharp/flat) on a piano. */
export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
}

/** Human-readable note label, e.g. 60 -> "C4". */
export function noteLabel(pitch: number): string {
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

/** Convert a MIDI pitch number to a Tone.js note string, e.g. 60 -> "C4". */
export function midiToToneNote(pitch: number): string {
  return noteLabel(pitch);
}
