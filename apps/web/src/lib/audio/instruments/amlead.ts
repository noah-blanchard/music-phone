import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Warbly AM lead with a hollow character. */
export const amlead: InstrumentDef = {
  id: "amlead",
  label: "AM Lead",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 2.5,
      envelope: { attack: 0.008, decay: 0.2, sustain: 0.4, release: 0.3 },
      modulation: { type: "sawtooth" },
      volume: -13,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
