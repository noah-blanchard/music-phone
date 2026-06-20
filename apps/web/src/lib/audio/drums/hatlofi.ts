import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Mellow lo-fi hat — softened high end. */
export const hatlofi: DrumDef = {
  id: "hatlofi",
  label: "Hat",
  create(): DrumVoice {
    const filter = new Tone.Filter(6000, "bandpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
      volume: -20,
    }).connect(filter);
    return {
      trigger: (t) => synth.triggerAttackRelease("32n", t),
      dispose: () => {
        synth.dispose();
        filter.dispose();
      },
    };
  },
};
