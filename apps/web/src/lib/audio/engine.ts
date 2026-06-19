import * as Tone from "tone";
import { getRole, midiToToneNote, type Layer, type Note, type Timbre } from "@musicphone/shared";
import { getInstrument } from "./instruments";
import { getDrumKit } from "./drums";

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

/** Audition a note through a specific role instrument (layers mode placement). */
export function previewInstrument(instrumentId: string, pitch: number): void {
  if (!started) return;
  getInstrument(instrumentId).triggerAttackRelease(midiToToneNote(pitch), 0.2, Tone.now());
}

/** Audition a drum lane immediately (drum-grid placement). */
export function previewDrum(lane: number): void {
  if (!started) return;
  getDrumKit()[lane]?.trigger(Tone.now());
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

/**
 * Schedule and play stacked layers (layers mode). Each layer resolves its own
 * instrument from its role (drum lanes for drum roles), and all layers play
 * simultaneously over the same `totalSteps`-long loop. When `loop` is true the
 * loop repeats and `onEnd` never fires; otherwise it plays once.
 */
export function playLayers(
  layers: Layer[],
  bpm: number,
  totalSteps: number,
  callbacks: { onStep?: (step: number) => void; onEnd?: () => void; loop?: boolean } = {},
): PlayHandle {
  const dt = stepSeconds(bpm);
  const loopEnd = totalSteps * dt;

  Tone.getTransport().stop();
  Tone.getTransport().cancel();
  Tone.getTransport().position = 0;

  const parts: Tone.Part[] = [];
  for (const layer of layers) {
    const role = getRole(layer.roleId);
    if (!role || layer.notes.length === 0) continue;
    const isDrums = role.editor === "drum-grid";
    const instrument = isDrums ? null : getInstrument(role.instrumentId);
    const part = new Tone.Part(
      (time, ev: Note) => {
        if (isDrums) {
          getDrumKit()[ev.pitch]?.trigger(time);
        } else {
          instrument!.triggerAttackRelease(
            midiToToneNote(ev.pitch),
            Math.max(ev.length * dt * 0.95, 0.05),
            time,
          );
        }
      },
      layer.notes.map((n) => [n.start * dt, n] as [number, Note]),
    );
    if (callbacks.loop) {
      part.loop = true;
      part.loopEnd = loopEnd;
    }
    part.start(0);
    parts.push(part);
  }

  const cursor = new Tone.Loop((time) => {
    const raw = Math.round(Tone.getTransport().seconds / dt);
    const step = callbacks.loop ? raw % totalSteps : raw;
    Tone.getDraw().schedule(() => callbacks.onStep?.(step), time);
  }, dt).start(0);

  let endId = -1;
  if (!callbacks.loop) {
    endId = Tone.getTransport().scheduleOnce((time) => {
      Tone.getDraw().schedule(() => callbacks.onEnd?.(), time);
    }, loopEnd + 0.1);
  }

  Tone.getTransport().start();

  const stop = () => {
    for (const p of parts) {
      p.stop();
      p.dispose();
    }
    cursor.stop();
    cursor.dispose();
    if (endId >= 0) Tone.getTransport().clear(endId);
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
  };

  return { stop };
}
