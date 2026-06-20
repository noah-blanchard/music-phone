import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Soft, low-passed lo-fi kick — rounded and quiet. */
export const kicklofi: DrumDef = {
  id: "kicklofi",
  label: "Kick",
  create(): DrumVoice {
    const filter = new Tone.Filter(220, "lowpass").toDestination();
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.2 },
      volume: -6,
    }).connect(filter);
    return {
      trigger: (t) => synth.triggerAttackRelease("C1", "8n", t),
      dispose: () => {
        synth.dispose();
        filter.dispose();
      },
    };
  },
};
