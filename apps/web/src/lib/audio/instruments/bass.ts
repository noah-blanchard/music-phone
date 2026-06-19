import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Round sine bass with a touch of body — the default Bass voice. */
export const bass: InstrumentDef = {
  id: "bass",
  label: "Bass",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 },
      volume: -8,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
