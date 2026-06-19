import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Snappy white-noise snare with a band-pass body. */
export const snare: DrumDef = {
  id: "snare",
  label: "Snare",
  create(): DrumVoice {
    const filter = new Tone.Filter(1800, "bandpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      volume: -8,
    }).connect(filter);
    return {
      trigger: (t) => synth.triggerAttackRelease("16n", t),
      dispose: () => {
        synth.dispose();
        filter.dispose();
      },
    };
  },
};
