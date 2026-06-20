import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Dusty, band-limited lo-fi snare. */
export const snarelofi: DrumDef = {
  id: "snarelofi",
  label: "Snare",
  create(): DrumVoice {
    const filter = new Tone.Filter(1400, "lowpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: { attack: 0.002, decay: 0.14, sustain: 0 },
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
