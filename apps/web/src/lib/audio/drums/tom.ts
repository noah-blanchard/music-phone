import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Mid tom (pitched membrane, higher than the kick). */
export const tom: DrumDef = {
  id: "tom",
  label: "Tom",
  create(): DrumVoice {
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2 },
      volume: -8,
    }).toDestination();
    return {
      trigger: (t) => synth.triggerAttackRelease("G2", "8n", t),
      dispose: () => synth.dispose(),
    };
  },
};
