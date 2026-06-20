import type { ScaleType } from "./types";

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

/** Every chromatic MIDI pitch (ascending) in a window from `root` up `octaves`. */
export function buildChromaticWindow(root: number, octaves: number): number[] {
  const pitches: number[] = [];
  for (let p = root; p <= root + octaves * 12; p++) pitches.push(p);
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
