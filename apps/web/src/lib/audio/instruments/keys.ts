import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Soft triangle keys — the default Chords voice. */
export const keys: InstrumentDef = {
  id: "keys",
  label: "Keys",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.4 },
      volume: -13,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
