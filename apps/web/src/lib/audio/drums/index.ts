import type { DrumDef, DrumVoice } from "./types";
import { kick } from "./kick";
import { snare } from "./snare";
import { hat } from "./hat";
import { clap } from "./clap";
import { tom } from "./tom";
import { openhat } from "./openhat";

export type { DrumDef, DrumVoice } from "./types";

/**
 * Ordered drum-grid lanes. The array index is the drum note `pitch` stored in a
 * Segment, so this order is the contract shared by every client and the results
 * reveal — append new pieces, don't reorder. Add a drum = add a file + an entry
 * (stay within `MAX_DRUM_VOICES` from @musicphone/shared).
 */
export const DRUM_DEFS: DrumDef[] = [kick, snare, hat, clap, tom, openhat];

/** Lane metadata for the editor (no audio created). */
export const DRUM_LANES = DRUM_DEFS.map((d, i) => ({ index: i, id: d.id, label: d.label }));

let live: DrumVoice[] | null = null;

/** Lazily create the kit (after `ensureAudio()`); cached across calls. */
export function getDrumKit(): DrumVoice[] {
  if (!live) live = DRUM_DEFS.map((d) => d.create());
  return live;
}

export function disposeDrumKit(): void {
  if (live) for (const v of live) v.dispose();
  live = null;
}
