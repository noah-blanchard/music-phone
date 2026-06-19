/**
 * Modular instrument system. Each pitched sound is its own file exporting an
 * `InstrumentDef`; the registry (`index.ts`) wires them up by id. A role in
 * `@musicphone/shared` references an instrument by `instrumentId`. Adding a new
 * sound = add a file + one registry line.
 */

/** A live, playable instrument voice (created after the AudioContext starts). */
export interface Instrument {
  /** Trigger a pitched note. `note` is a Tone note string (e.g. "C4"). */
  triggerAttackRelease(note: string, durationSec: number, time: number): void;
  dispose(): void;
}

export interface InstrumentDef {
  id: string;
  label: string;
  /** Build the Tone.js voice. Called lazily once, after `ensureAudio()`. */
  create(): Instrument;
}
