import type { DrumDef, DrumVoice } from "./types";
import { kick } from "./kick";
import { snare } from "./snare";
import { hat } from "./hat";
import { clap } from "./clap";
import { tom } from "./tom";
import { openhat } from "./openhat";
import { kick808 } from "./kick808";
import { snare808 } from "./snare808";
import { hat808 } from "./hat808";
import { kicklofi } from "./kicklofi";
import { snarelofi } from "./snarelofi";
import { hatlofi } from "./hatlofi";

/**
 * Canonical drum-grid lanes. The lane index is the drum note `pitch` stored in a
 * Segment — this order is the cross-client/server contract, so append, don't
 * reorder. Every kit provides one voice per lane in this same order.
 */
export const DRUM_LANES = [
  { index: 0, id: "kick", label: "Kick" },
  { index: 1, id: "snare", label: "Snare" },
  { index: 2, id: "hat", label: "Hat" },
  { index: 3, id: "clap", label: "Clap" },
  { index: 4, id: "tom", label: "Tom" },
  { index: 5, id: "openhat", label: "Open Hat" },
] as const;

interface DrumKitDef {
  id: string;
  label: string;
  /** One DrumDef per lane, index-aligned to DRUM_LANES. */
  voices: DrumDef[];
}

/**
 * Selectable drum kits. Add a kit = add an entry (reusing voice files or new
 * ones). Each kit maps the canonical lanes to its own voices.
 */
export const KITS: DrumKitDef[] = [
  { id: "kit-synth", label: "Synth", voices: [kick, snare, hat, clap, tom, openhat] },
  { id: "kit-808", label: "808", voices: [kick808, snare808, hat808, clap, tom, openhat] },
  { id: "kit-lofi", label: "Lo-Fi", voices: [kicklofi, snarelofi, hatlofi, clap, tom, openhat] },
];

const kitById = new Map(KITS.map((k) => [k.id, k]));
const live = new Map<string, DrumVoice[]>();

/** Lazily build + cache a kit's voices (after `ensureAudio()`). */
export function getDrumKitVoices(kitId: string | undefined): DrumVoice[] {
  const id = kitId && kitById.has(kitId) ? kitId : KITS[0]!.id;
  const cached = live.get(id);
  if (cached) return cached;
  const voices = (kitById.get(id) ?? KITS[0]!).voices.map((d) => d.create());
  live.set(id, voices);
  return voices;
}

/** Human-readable label for a kit id. */
export function getDrumKitLabel(kitId: string): string {
  return kitById.get(kitId)?.label ?? kitId;
}

export function disposeDrumKits(): void {
  for (const voices of live.values()) for (const v of voices) v.dispose();
  live.clear();
}
