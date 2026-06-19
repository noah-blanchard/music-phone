import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Lush slow-attack sawtooth pad — the default Pad voice. */
export const pad: InstrumentDef = {
  id: "pad",
  label: "Pad",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.25, decay: 0.3, sustain: 0.8, release: 0.8 },
      volume: -16,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
