import type { Instrument, InstrumentDef } from "./types";
import { lead } from "./lead";
import { keys } from "./keys";
import { bass } from "./bass";
import { pluck } from "./pluck";
import { pad } from "./pad";
import { saw } from "./saw";
import { fmlead } from "./fmlead";
import { amlead } from "./amlead";
import { monobass } from "./monobass";
import { fmbass } from "./fmbass";
import { fmkeys } from "./fmkeys";
import { ampad } from "./ampad";

export type { Instrument, InstrumentDef } from "./types";

/** Registry of all pitched instruments. Add a sound = add a file + an entry. */
const DEFS: InstrumentDef[] = [
  lead, keys, bass, pluck, pad, saw,
  fmlead, amlead, monobass, fmbass, fmkeys, ampad,
];

const byId = new Map(DEFS.map((d) => [d.id, d]));
const live = new Map<string, Instrument>();

/**
 * Resolve a lazily-created instrument by id. Unknown ids fall back to `lead` so
 * a role with a not-yet-registered sound still makes noise. Must be called after
 * `ensureAudio()`.
 */
export function getInstrument(id: string): Instrument {
  const cached = live.get(id);
  if (cached) return cached;
  const def = byId.get(id) ?? lead;
  const inst = def.create();
  live.set(id, inst);
  return inst;
}

/** Human-readable label for an instrument id (falls back to the id itself). */
export function getInstrumentLabel(id: string): string {
  return byId.get(id)?.label ?? id;
}

/** Dispose all created instruments (e.g. on teardown). */
export function disposeInstruments(): void {
  for (const inst of live.values()) inst.dispose();
  live.clear();
}
