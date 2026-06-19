import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Bright square-wave lead — the default Melody voice. */
export const lead: InstrumentDef = {
  id: "lead",
  label: "Lead",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "square" },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.3, release: 0.2 },
      volume: -12,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
