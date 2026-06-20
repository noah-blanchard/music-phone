import * as Tone from "tone";
import type { DrumDef, DrumVoice } from "./types";

/** 808-style snare: noise burst over a short tonal body. */
export const snare808: DrumDef = {
  id: "snare808",
  label: "Snare",
  create(): DrumVoice {
    const filter = new Tone.Filter(2200, "highpass").toDestination();
    const noise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      volume: -10,
    }).connect(filter);
    const body = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0 },
      volume: -14,
    }).toDestination();
    return {
      trigger: (t) => {
        noise.triggerAttackRelease("8n", t);
        body.triggerAttackRelease("D3", "16n", t);
      },
      dispose: () => {
        noise.dispose();
        body.dispose();
        filter.dispose();
      },
    };
  },
};
