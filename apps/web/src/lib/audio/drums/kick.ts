import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** Punchy kick drum (pitched membrane). */
export const kick: DrumDef = {
  id: "kick",
  label: "Kick",
  create(): DrumVoice {
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 },
      volume: -4,
    }).toDestination();
    return {
      trigger: (t) => synth.triggerAttackRelease("C1", "8n", t),
      dispose: () => synth.dispose(),
    };
  },
};
