import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Cutting sawtooth lead — the default (extra) Lead voice. */
export const saw: InstrumentDef = {
  id: "saw",
  label: "Saw Lead",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.35, release: 0.2 },
      volume: -14,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
