import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Deep FM bass with a short, woody attack. */
export const fmbass: InstrumentDef = {
  id: "fmbass",
  label: "FM Bass",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 1,
      modulationIndex: 5,
      envelope: { attack: 0.005, decay: 0.18, sustain: 0.5, release: 0.2 },
      modulation: { type: "sine" },
      volume: -9,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
