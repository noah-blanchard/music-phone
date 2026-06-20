import * as Tone from "tone";
import { getRole, midiToToneNote, roleDefaultSound, type Layer, type Note } from "@musicphone/shared";
import { getInstrument } from "./instruments";
import { getDrumKitVoices } from "./drums";

/**
 * Thin wrapper around Tone.js. The AudioContext can only start after a user
 * gesture, so `ensureAudio()` must be awaited from a click/keypress handler
 * before any sound is produced. Sounds are resolved lazily from the instrument
 * and drum-kit registries.
 */

let started = false;

/** Start the AudioContext. Safe to call repeatedly; only the first awaits. */
export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start();
    started = true;
  }
}

/** Audition a note through a specific role instrument (placement preview). */
export function previewInstrument(instrumentId: string, pitch: number): void {
  if (!started) return;
  getInstrument(instrumentId).triggerAttackRelease(midiToToneNote(pitch), 0.2, Tone.now());
}

/** Audition a drum lane immediately through a kit (drum-grid placement). */
export function previewDrum(kitId: string, lane: number): void {
  if (!started) return;
  getDrumKitVoices(kitId)[lane]?.trigger(Tone.now());
}

/** Seconds per 16th-note step at a given tempo (4 sixteenths per beat). */
export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

export interface PlayHandle {
  stop: () => void;
}

/**
 * Schedule and play stacked layers. Each layer resolves its own
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
    const soundId = layer.instrumentId ?? roleDefaultSound(role);
    const drumVoices = isDrums ? getDrumKitVoices(soundId) : null;
    const instrument = isDrums ? null : getInstrument(soundId);
    const part = new Tone.Part(
      (time, ev: Note) => {
        if (isDrums) {
          drumVoices![ev.pitch]?.trigger(time);
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
