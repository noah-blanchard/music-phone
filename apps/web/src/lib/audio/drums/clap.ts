import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Hand-clap (pink noise with a quick decay). */
export const clap: DrumDef = {
  id: "clap",
  label: "Clap",
  create(): DrumVoice {
    const filter = new Tone.Filter(1200, "bandpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0 },
      volume: -10,
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
