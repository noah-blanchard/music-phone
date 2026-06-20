import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Electric-piano-ish FM keys, good for chords. */
export const fmkeys: InstrumentDef = {
  id: "fmkeys",
  label: "FM Keys",
  create(): Instrument {
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 3,
      modulationIndex: 4,
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.2, release: 0.6 },
      modulation: { type: "sine" },
      volume: -15,
    }).toDestination();
    return {
      triggerAttackRelease: (n, d, t) => synth.triggerAttackRelease(n, d, t),
      dispose: () => synth.dispose(),
    };
  },
};
