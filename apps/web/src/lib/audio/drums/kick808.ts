import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Long, boomy 808 kick with a deep pitch slide. */
export const kick808: DrumDef = {
  id: "kick808",
  label: "Kick",
  create(): DrumVoice {
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 8,
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.4 },
      volume: -3,
    }).toDestination();
    return {
      trigger: (t) => synth.triggerAttackRelease("A0", "4n", t),
      dispose: () => synth.dispose(),
    };
  },
};
