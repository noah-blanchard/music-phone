import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Metallic 808 hi-hat. */
export const hat808: DrumDef = {
  id: "hat808",
  label: "Hat",
  create(): DrumVoice {
    const synth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 5000,
      octaves: 1.5,
      volume: -24,
    }).toDestination();
    return {
      trigger: (t) => synth.triggerAttackRelease("32n", t),
      dispose: () => synth.dispose(),
    };
  },
};
