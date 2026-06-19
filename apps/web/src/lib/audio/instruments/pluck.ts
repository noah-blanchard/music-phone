import * as Tone from "tone";
import type { Instrument, InstrumentDef } from "./types";

/** Plucked string — the default Arp voice. */
export const pluck: InstrumentDef = {
  id: "pluck",
  label: "Pluck",
  create(): Instrument {
    // PluckSynth is monophonic — well suited to a single-line arp.
    const synth = new Tone.PluckSynth({
      attackNoise: 1,
      dampening: 4000,
      resonance: 0.9,
      volume: -6,
    }).toDestination();
    return {
      // PluckSynth ignores duration/velocity but honors the scheduled time.
      triggerAttackRelease: (n, _d, t) => synth.triggerAttackRelease(n, "8n", t),
      dispose: () => synth.dispose(),
    };
  },
};
