import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Open hi-hat (longer high-passed noise tail). */
export const openhat: DrumDef = {
  id: "openhat",
  label: "Open Hat",
  create(): DrumVoice {
    const filter = new Tone.Filter(7000, "highpass").toDestination();
    const synth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0 },
      volume: -18,
    }).connect(filter);
    return {
      trigger: (t) => synth.triggerAttackRelease("8n", t),
      dispose: () => {
        synth.dispose();
        filter.dispose();
      },
    };
  },
};
