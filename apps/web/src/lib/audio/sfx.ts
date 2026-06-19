import * as Tone from "tone";

/**
 * UI "juice" sound effects, kept separate from the musical engine. All are
 * no-ops until the AudioContext is running (i.e. after the first user gesture
 * that calls ensureAudio()), so they can be sprinkled on any handler safely.
 */

let synth: Tone.Synth | null = null;
let noise: Tone.NoiseSynth | null = null;

function ready(): boolean {
  return Tone.getContext().state === "running";
}

function getSynth(): Tone.Synth {
  if (!synth) {
    synth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.03 },
      volume: -20,
    }).toDestination();
  }
  return synth;
}

function getNoise(): Tone.NoiseSynth {
  if (!noise) {
    noise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0 },
      volume: -28,
    }).toDestination();
  }
  return noise;
}

/** Short tactile click for button presses. */
export function uiClick(): void {
  if (!ready()) return;
  getNoise().triggerAttackRelease(0.02);
}

/** Soft high blip for hovers / selections. */
export function uiHover(): void {
  if (!ready()) return;
  getSynth().triggerAttackRelease("C6", 0.02, undefined, 0.3);
}

/** Confirmation chirp (submit, start). */
export function uiConfirm(): void {
  if (!ready()) return;
  const s = getSynth();
  const t = Tone.now();
  s.triggerAttackRelease("E5", 0.05, t);
  s.triggerAttackRelease("B5", 0.06, t + 0.06);
}

/** Countdown beep; pass 0 for the final, higher "go" tone. */
export function countdownBlip(n: number): void {
  if (!ready()) return;
  getSynth().triggerAttackRelease(n === 0 ? "C6" : "G4", 0.12, undefined, 0.5);
}
