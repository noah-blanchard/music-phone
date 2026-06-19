import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Tight closed hi-hat (high-passed short noise). */
export const hat: DrumDef = {
  id: "hat",
  label: "Hat",
  create(): DrumVoice {
    const filter = new Tone.Filter(8000, "highpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
      volume: -16,
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
