import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Soft, evolving AM pad with a slow attack. */
export const ampad: InstrumentDef = {
  id: "ampad",
  label: "AM Pad",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 1.5,
      envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.0 },
      modulation: { type: "triangle" },
      volume: -17,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
