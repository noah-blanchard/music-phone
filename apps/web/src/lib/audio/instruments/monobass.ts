import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Filtered MonoSynth bass with a punchy filter envelope. */
export const monobass: InstrumentDef = {
  id: "monobass",
  label: "Mono Bass",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.MonoSynth, {
      oscillator: { type: "sawtooth" },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 120, octaves: 3 },
      volume: -10,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
