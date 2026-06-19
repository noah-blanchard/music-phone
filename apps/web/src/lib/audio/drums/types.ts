/**
 * Modular drum system. Each percussion piece is its own file exporting a
 * `DrumDef`; the registry (`index.ts`) lists them as the ordered drum-grid
 * lanes. A drum note's `pitch` is the lane index into `DRUM_KIT`. Adding a drum
 * sound = add a file + one registry line.
 */

export interface DrumVoice {
  /** Trigger this drum at a scheduled transport time. */
  trigger(time: number): void;
  dispose(): void;
}

export interface DrumDef {
  id: string;
  label: string;
  /** Build the Tone.js voice. Called lazily once, after `ensureAudio()`. */
  create(): DrumVoice;
}
