import * as Tone from "tone";
import { midiToToneNote, type Note, type Timbre } from "@musicphone/shared";

/**
 * Thin wrapper around Tone.js. Holds one PolySynth per timbre so a single turn
 * can mix all four oscillator types. The AudioContext can only start after a
 * user gesture, so `ensureAudio()` must be awaited from a click/keypress handler
 * before any sound is produced.
 */

let synths: Record<Timbre, Tone.PolySynth> | null = null;
let started = false;

function getSynths(): Record<Timbre, Tone.PolySynth> {
  if (synths) return synths;
  const make = (type: Timbre) =>
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.2 },
      volume: -8,
    }).toDestination();
  synths = {
    sine: make("sine"),
    triangle: make("triangle"),
    sawtooth: make("sawtooth"),
    square: make("square"),
  };
  return synths;
}

/** Start the AudioContext. Safe to call repeatedly; only the first awaits. */
export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start();
    started = true;
  }
  getSynths();
}

/** Audition a single note immediately (e.g. when placing it on the grid). */
export function previewNote(pitch: number, timbre: Timbre): void {
  if (!started) return;
  getSynths()[timbre].triggerAttackRelease(midiToToneNote(pitch), "16n");
}

/** Seconds per 16th-note step at a given tempo (4 sixteenths per beat). */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export interface PlayHandle {
  stop: () => void;
}

/**
 * Schedule and play a flat list of notes whose `start`/`length` are in absolute
 * 16th-note steps from t=0. `onStep` is called each step for a playhead cursor;
 * `onEnd` fires after the last note finishes. Returns a handle to stop early.
 */
export function playNotes(
  notes: Note[],
  bpm: number,
  totalSteps: number,
  callbacks: { onStep?: (step: number) => void; onEnd?: () => void } = {},
): PlayHandle {
  const dt = stepSeconds(bpm);
  const synthsByTimbre = getSynths();

  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  Tone.getTransport().position = 0;

  const part = new Tone.Part(
    (time, ev: Note) => {
      synthsByTimbre[ev.timbre].triggerAttackRelease(
        midiToToneNote(ev.pitch),
        Math.max(ev.length * dt * 0.95, 0.05),
        time,
      );
    },
    notes.map((n) => [n.start * dt, n] as [number, Note]),
  );
  part.start(0);

  // Playhead cursor: schedule a tick per step.
  const cursor = new Tone.Loop((time) => {
    const step = Math.round(Tone.getTransport().seconds / dt);
    Tone.getDraw().schedule(() => callbacks.onStep?.(step), time);
  }, dt).start(0);

  const endAt = totalSteps * dt + 0.1;
  const endId = Tone.getTransport().scheduleOnce((time) => {
    Tone.getDraw().schedule(() => callbacks.onEnd?.(), time);
  }, endAt);

  Tone.getTransport().start();

  const stop = () => {
    part.stop();
    part.dispose();
    cursor.stop();
    cursor.dispose();
    Tone.getTransport().clear(endId);
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
  };

  return { stop };
}
