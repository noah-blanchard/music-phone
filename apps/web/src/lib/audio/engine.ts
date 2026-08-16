import * as Tone from "tone";
import {
  getRole,
  midiToToneNote,
  roleDefaultSound,
  type Layer,
  type Note,
} from "@musicphone/shared";
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

export interface PlayCallbacks {
  onStep?: (step: number) => void;
  /** Playback reached the end of a non-looping pass. */
  onEnd?: () => void;
  /**
   * Playback was cut short because something else took the transport. The
   * caller's own `stop()` does not fire this — it already knows.
   */
  onStopped?: () => void;
  loop?: boolean;
}

interface TransportOwner {
  teardown: () => void;
  onStopped: (() => void) | undefined;
}

/**
 * Tone's transport is a singleton, so only one playback may own it at a time.
 * Tracking the owner is what lets a new `playLayers` evict the previous one
 * *and tell it* — without this, starting one song in the results screen
 * silently killed another whose button carried on showing "■".
 */
let owner: TransportOwner | null = null;

function release(notify: boolean): void {
  const previous = owner;
  owner = null;
  if (!previous) return;
  previous.teardown();
  if (notify) previous.onStopped?.();
}

/**
 * Schedule and play stacked layers. Each layer resolves its own
 * instrument from its role (drum lanes for drum roles), and all layers play
 * simultaneously over the same `totalSteps`-long loop. When `loop` is true the
 * loop repeats and `onEnd` never fires; otherwise it plays once.
 *
 * Starting playback stops whatever was playing before it.
 */
export function playLayers(
  layers: Layer[],
  bpm: number,
  totalSteps: number,
  callbacks: PlayCallbacks = {},
): PlayHandle {
  const dt = stepSeconds(bpm);
  const loopEnd = totalSteps * dt;

  release(true);
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

  const self: TransportOwner = {
    onStopped: callbacks.onStopped,
    teardown: () => {
      for (const p of parts) {
        p.stop();
        p.dispose();
      }
      cursor.stop();
      cursor.dispose();
      if (endId >= 0) Tone.getTransport().clear(endId);
      Tone.getTransport().stop();
      Tone.getTransport().cancel();
    },
  };
  owner = self;

  // A handle that no longer owns the transport must not tear down the playback
  // that replaced it, so stopping late is a no-op rather than a hijack.
  return {
    stop: () => {
      if (owner === self) release(false);
    },
  };
}
