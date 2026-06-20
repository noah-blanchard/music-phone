import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Bright, slightly metallic FM lead. */
export const fmlead: InstrumentDef = {
  id: "fmlead",
  label: "FM Lead",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 8,
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.2 },
      modulation: { type: "square" },
      volume: -14,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
