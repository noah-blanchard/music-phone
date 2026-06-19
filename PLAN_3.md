# MusicPhone — V3 Plan: "Layered Arrangement" mode + modular mode/sound systems

## Context

V1/V2 ship a working "telephone melody" game: N players, N melodies, a derangement rotation,
and each turn **appends 4 new sequential measures** to a melody you only partly see. It works, but
the user finds the *playability* weak — extending a half-seen melody in time is hard to make
musical, and the result is one long mutating line.

The user wants a **new main mode — "Layered Arrangement"** — that keeps the rotation idea but
changes what a turn *is*: every song is a **fixed loop of `barsPerSong` bars** (default 4, host
sets 2–8), and each round a player adds a **different role/layer over the same bars** instead of
extending in time. Round 1 = Melody, round 2 = Chords, round 3 = Bass, round 4 = Drums, then
Arp/Pad/Lead/Perc for larger rooms. With N players you get N songs, each stacking N simultaneous
layers authored by N different players — telephone-style, because a player only sees/hears a
limited slice of the layers placed before them.

Two cross-cutting requirements the user stressed:
1. **Game modes must be a modular plug-in system** — adding a mode = adding a module/file + a
   registry entry, no edits scattered across the codebase. The existing "Continue the Melody"
   mode is refactored into the first such module; "Layers" becomes the **default**.
2. **Sounds must be a modular plug-in system** — each instrument and each drum piece is its own
   file behind a registry; adding a sound = adding a file + registering it.

Outcome: a more musical, more playable default game, on an architecture where modes and sounds are
cheap to add.

---

## Locked decisions (from clarification)

| Area | Decision |
|---|---|
| Mode coexistence | **Both modes kept**; "Layers" is the **default**. Modes are plug-in modules behind a registry. |
| Roles | **Fixed preset, ordered**: Melody → Chords → Bass → Drums → Arp → Pad → Lead → Perc. Round `r` uses `preset[r]`. |
| Layers per song | **N layers = N players = N rounds** (`totalRounds = N`); roles used = `preset.slice(0, N)`. |
| Bars per song | Host-set **2–8**, default **4**; fixed loop length (no context measure carved out). |
| Context (telephone) | **Host-configurable**: `previous` (only the last layer) / `all` (everything so far) / `blind` (nothing). Round 1 is always blind (seed). |
| Drums | **Dedicated drum-grid editor** + **synth-generated** drum sounds (Tone.js), not the pitched roll. |
| Sounds | **Modular** — one file per instrument / per drum piece, behind a registry. |
| Per-role sound | **Each role has its own instrument + octave window**, defined in its role module. |
| Editors | **Two types**: scale-locked **piano-roll** (all pitched roles; chords = place multiple notes) + **drum grid**. |
| Results | **Loop the bars, all layers stacked, mute/solo per layer.** |
| Guided reveal | **Realtime synced**: each song's seed player (the Melody author) steps a progressive layer reveal; revealed-layer count + play state broadcast so everyone follows together. Local mute/solo still allowed. |

---

## Architecture: two modular systems

### 1) Game-mode module system (pure logic in `@musicphone/shared`)

The mode's *rules* are pure, dependency-free data/logic so server and client agree exactly — they
live in shared. A mode declares everything the engine needs; `RoomManager` and the client become
mode-agnostic and just call into the selected module.

```
packages/shared/src/modes/
  types.ts      GameMode interface, Role, RoundContext, ContextVisibility, GameModeId
  continue.ts   existing behavior extracted: sequential append, last-measure context
  layers.ts     new mode: fixed-loop, role preset, per-host context rule
  index.ts      MODES: Record<GameModeId, GameMode>; getMode(id)
```

`GameMode` interface (shape):
```ts
interface GameMode {
  id: GameModeId;                 // "continue" | "layers"
  name: string; description: string;
  totalRounds(playerCount: number, config: GameConfig): number;     // both: N
  assign(playerIndex: number, round: number, n: number): number;    // both: (i+r)%n
  roleForRound(round: number, config: GameConfig): Role | null;     // layers: preset[r]; continue: null
  /** Read-only context handed to a player at round start (mode + host setting aware). */
  buildContext(song: Melody, round: number, config: GameConfig): RoundContext;
  /** Editable grid geometry for a turn. */
  turnSteps(config: GameConfig): number;                            // continue: 64; layers: bars*16
  /** Validate a submitted turn for the round's role (scale vs drum lanes). */
  validateTurn(notes: unknown, round: number, config: GameConfig): Note[];
}
```

`RoundContext` is a small union the client renders/plays:
```ts
type RoundContext =
  | { kind: "trailing-measure"; notes: Note[] }                       // continue
  | { kind: "layers"; layers: { roleId: string; notes: Note[] }[] };  // layers (0..many per host setting)
```

`Role` (pure data, dependency-free):
```ts
interface Role {
  id: string; name: string; color: string;
  editor: "piano-roll" | "drum-grid";
  instrumentId: string;            // resolved by the web sound registry
  octaveOffset: number; octaves: number;   // pitch window relative to config.root (piano-roll only)
  scaleLocked: boolean;            // true for pitched, false (lane-set) for drums
}
const LAYER_ROLES: Role[] = [ melody, chords, bass, drums, arp, pad, lead, perc ];
```

**Adding a mode** = create `modes/<id>.ts` implementing `GameMode`, register in `modes/index.ts`,
add the id to `GameModeId`. Server/client need no other changes.

### 2) Sound module system (web-only, wraps Tone.js)

Tone lives only in the web app, so the *sound implementations* are web-side, keyed by the same ids
the role modules reference.

```
apps/web/src/lib/audio/
  instruments/
    types.ts     Instrument factory contract { id, create(): ToneNode, triggerNote(...) }
    lead.ts pad.ts bass.ts keys.ts ...   one file per instrument
    index.ts     INSTRUMENTS registry; getInstrument(id)
  drums/
    types.ts     DrumVoice contract { id, label, trigger(time) }
    kick.ts snare.ts hat.ts clap.ts tom.ts ...   one synth-built voice per file
    index.ts     DRUM_KIT registry; ordered lanes for the drum grid
  engine.ts      ensureAudio(), play scheduler — now resolves notes through the registries
```

**Adding a sound** = create `instruments/<id>.ts` (or `drums/<id>.ts`), register it. A role can then
reference it by id; the drum grid auto-lists new drum voices as lanes.

---

## Data-model changes (`packages/shared/src/types.ts`)

Additive — `continue` keeps working.

- `GameConfig`: add `mode: GameModeId` (default `"layers"`), `barsPerSong: number` (2–8, default 4),
  `contextVisibility: "previous" | "all" | "blind"` (default `"previous"`). Keep `measuresPerTurn`
  (continue only). `DEFAULT_CONFIG.mode = "layers"`.
- `Segment`: add `roleId?: string` (the layer's role; `order` still = round/layer index).
- `Note`: drum hits reuse the shape — `pitch` carries the **drum-voice index**, `length` = 1,
  `timbre` unused for drum roles. Pitched roles unchanged. (No new field needed.)
- `Room`: add results-only `reveal: Record<string /*songId*/, { revealedLayers: number; playing: boolean }>`.
- `RoomSnapshot`: carry `reveal` (results phase) so clients render the synced reveal.
- Helper: `barSteps(config)` and a mode-aware `turnSteps` via `getMode(config.mode).turnSteps(config)`.

`scales.ts`: add a role-window pitch builder (`buildRolePitches(config, role)`) reusing the existing
`buildScalePitches`/`isInScale`; keep `buildScalePitches` for the full grid + server validation.

---

## Protocol changes (`packages/shared/src/messages.ts`)

Additive and mode-agnostic.

- `round:started`: replace the bare `contextNotes` with `context: RoundContext` and add
  `role: Role | null` (the current role for layers; `null` for continue). Keep `round`, `endsAt`.
  (Continue emits `{ kind: "trailing-measure", notes }`; client maps it to today's behavior.)
- New **results reveal** messages:
  - Client→Server `reveal:update { songId, revealedLayers, playing }` — accepted only from that
    song's seed player (controller). Server clamps and broadcasts.
  - Server→Client reveal state travels inside `room:snapshot` (`reveal` field) — no extra message
    type needed; `broadcastSnapshot` already fans out on every change.

Per-machine audio is **not** sample-accurately clock-synced; the *synced state* is the revealed-layer
count + play/stop, and each client loops the bars locally. This matches "slowly reveal each layer for
everyone" without a clock-sync subsystem (documented limitation).

---

## Server refactor (`apps/server/src/game/`)

Make `RoomManager` delegate to the selected mode instead of hardcoding continuation:

- `startGame`: `const mode = getMode(room.config.mode); room.totalRounds = mode.totalRounds(n, config);`
  seed songs as today (`melodies = players.map(seed)`).
- `beginRound` / `sync`: build the round payload via `mode.buildContext(song, round, config)` and
  `mode.roleForRound(round, config)` instead of `lastMeasureContext`. The existing
  `melodyIndexForPlayer` becomes `mode.assign(...)` (continue/layers share the same formula but it's
  now owned by the module).
- `submit` / `autosave`: validate via `mode.validateTurn(notes, round, config)` (role-aware:
  scale-lock for pitched, drum-lane set for drums).
- `advanceRound`: commit each player's notes as a `Segment` with `roleId = mode.roleForRound(...)?.id`.
- New results handlers: `reveal:update` → mutate `room.reveal[songId]` if `playerId` is that song's
  `seedPlayerId`, then `broadcastSnapshot`. Initialize `room.reveal` when entering `results`.
- `rotation.ts` keeps `lastMeasureContext` but it's now called *from* `modes/continue.ts`;
  `melodyIndexForPlayer` is re-exported for both modules.

`ws/handlers.ts`: route the new `reveal:update` client message; `schemas.ts`: add a dependency-free
validator for it and for the new config fields (`barsPerSong` range, enum checks). `sanitizeConfig`
must clamp `barsPerSong` (2–8) and accept `mode` / `contextVisibility`.

---

## Web changes

### Audio (modular sounds)
- Build `instruments/` and `drums/` registries (above). Each role's `instrumentId` resolves to a
  Tone instrument; the drum grid's lanes come from the `DRUM_KIT` ordered list.
- `engine.ts` `playNotes` becomes layer-aware: given a set of `{ roleId, notes }` it resolves each
  layer's instrument (drum voices for drum roles) and schedules them together. Keep the existing
  playhead/`stop()` cleanup contract.
- `lib/audio/schedule.ts`: add `stackLayers(melody)` (all segments at offset 0, for the looped
  arrangement) alongside the existing `flattenMelody` (sequential, for continue). Pick by
  `config.mode`.

### Editors (`apps/web/src/components/editors/`)
- `PianoRollEditor.tsx`: generalize today's `PianoRoll` to take a `Role` (octave window +
  `scaleLocked`) and a `RoundContext` rendered as **read-only layers behind the grid** (each prior
  layer in its role color), replacing the single greyed context measure. Grid spans the full
  `barsPerSong` (no leading context measure in layers).
- `DrumGridEditor.tsx` (new): rows = `DRUM_KIT` lanes, columns = steps across `barsPerSong`;
  click toggles a 1-step hit; prior layers shown as muted background per the context setting; preview
  triggers the drum voice. Shares the responsive sizing / playhead approach with the piano roll.
- `Play.tsx`: choose the editor by `role.editor`; HUD shows the current **role name + color** and
  round X/N; bottom dock adapts (timbre palette only for piano-roll-with-per-note-timbre i.e.
  continue; layers use the role's fixed instrument).

### Results (`ResultsPlayer.tsx`) + store
- Stacked, looping playback of all layers; **mute/solo per layer** (role-colored strip with author
  avatars, reusing `PlayerAvatar`).
- **Synced reveal**: if `selfId === song.seedPlayerId`, show reveal controls (Reveal next layer /
  Play / Stop) that send `reveal:update`; everyone renders `snapshot.reveal[songId]` — revealed
  layers are audible/visible, hidden ones greyed. `game-store.ts` exposes `reveal` from the snapshot
  and a `setReveal(songId, revealedLayers, playing)` action.

### Lobby / config (`ConfigForm.tsx`, `views/Lobby.tsx`)
- Add a **mode selector** (Layers default, Continue available) — driven by the `MODES` registry so a
  new mode auto-appears. Show mode-specific settings: layers → `barsPerSong` knob + `contextVisibility`
  toggle; continue → existing `measuresPerTurn`. Keep BPM/root/scale/round duration shared.

---

## Brainstorm Q&A (locked answers + reasoned defaults)

**Game structure**
1. *Mode coexistence?* Keep both; **Layers default**; modes are plug-in modules behind a registry.
2. *Roles?* Fixed ordered preset: Melody, Chords, Bass, Drums, Arp, Pad, Lead, Perc.
3. *Layers per song?* `N = players = rounds`; roles = `preset.slice(0, N)`.
4. *Bars per song?* Host 2–8, default 4; fixed loop, every bar editable.
5. *Rotation?* Reuse `(i + r) % N` derangement; seed player `i` authors song `i`'s first role (Melody).
6. *What is a "segment" now?* A **layer** (role) over the full bars; stores `roleId`; `order` = round.

**Telephone / context**
7. *Context visibility?* Host-configurable: `previous` / `all` / `blind`.
8. *How shown?* Prior layer(s) rendered read-only behind the grid in their role colors + audible under your draft.
9. *Round 1 (Melody)?* Always blind (it's the seed); optional metronome/click for timing.
10. *Do you hear context while editing?* Yes — revealed prior layers play under your draft on Play.

**Editing**
11. *Editor types?* Piano-roll (pitched) + drum grid (percussion); chosen by `role.editor`.
12. *Chords input?* Place multiple notes on the piano-roll (no special chord-stamp in this version).
13. *Per-role instrument + range?* Yes — defined in the role module (`instrumentId`, octave window).
14. *Scale-lock?* Pitched roles scale-locked within their octave window; drums use a fixed lane set.
15. *Note duration?* Variable (drag) for pitched; drums are fixed 1-step hits.
16. *Per-note timbre palette?* Dropped in Layers (each layer = one instrument); retained for Continue.

**Sound system**
17. *Drum sounds?* Synth-generated, modular: one file per voice (kick/snare/hat/clap/tom…), registry.
18. *Instruments?* Modular: one file per instrument, registry; `role.instrumentId` resolves.
19. *Adding a sound?* Drop a file + register; drum grid auto-lists new voices; no other edits.

**Results / reveal**
20. *Playback?* Loop bars, all layers stacked, mute/solo per layer.
21. *Guided reveal?* Each song's seed player steps a synced progressive reveal (revealed count +
    play/stop broadcast via snapshot); others follow; local mute/solo still allowed.
22. *Export?* Keep JSON export of the finished `Melody[]`, now including `roleId` per layer.

**Technical / modularity**
23. *Where does logic live?* Pure mode rules + role tables in dependency-free `@musicphone/shared`;
    Tone instruments + editor components in web; registries on both sides keyed by shared ids.
24. *Validation?* Role-aware server validation: scale-lock for pitched, drum-lane membership for drums.
25. *Backward compat?* Continue mode preserved; protocol/config changes are additive.

---

## Implementation phases

- **A — Shared mode system.** `modes/{types,continue,layers,index}.ts`; extend `GameConfig`,
  `Segment`, `Room`, `RoomSnapshot`; `barSteps`/role-window helpers in `scales.ts`; role-aware
  `validateTurn`; update `messages.ts` (`round:started.context/role`, `reveal:update`); `schemas.ts`
  + `sanitizeConfig` for new fields. Typecheck shared.
- **B — Server.** Refactor `RoomManager` to delegate to `getMode(config.mode)` for rounds, rotation,
  context, validation, commit; add `reveal:update` handling + `room.reveal` init; route in
  `ws/handlers.ts`. Re-run the existing 3-player simulation for **continue** (regression) and add a
  layers simulation.
- **C — Web sounds.** `instruments/` + `drums/` registries with a few real voices; `engine.ts`
  layer-aware playback; `schedule.ts` `stackLayers`.
- **D — Web editors.** Generalize `PianoRollEditor`; new `DrumGridEditor`; `Play.tsx` picks editor by
  role + shows role HUD.
- **E — Results.** Stacked looping playback + mute/solo + synced seed-driven reveal + store wiring.
- **F — Lobby/config.** Registry-driven mode selector (Layers default) + mode-specific settings
  (`barsPerSong`, `contextVisibility`).

---

## Critical files

**Shared (new):** `packages/shared/src/modes/{types,continue,layers,index}.ts`.
**Shared (edit):** `types.ts`, `messages.ts`, `schemas.ts`, `scales.ts`, `index.ts` (re-exports).
**Server (edit):** `game/room-store.ts`, `game/rotation.ts`, `game/serialize.ts`, `ws/handlers.ts`.
**Web (new):** `lib/audio/instruments/*`, `lib/audio/drums/*`, `components/editors/{PianoRollEditor,DrumGridEditor}.tsx`.
**Web (edit/rewrite):** `lib/audio/{engine,schedule}.ts`, `components/views/Play.tsx`,
`components/ResultsPlayer.tsx`, `components/ConfigForm.tsx`, `components/views/Lobby.tsx`,
`store/game-store.ts` (reveal state + `round:started.context`). `PianoRoll.tsx` is absorbed by
`PianoRollEditor.tsx`.

---

## Verification

1. `bun run typecheck` clean across shared/server/web; `bun run build` for web.
2. **Server sims:** the existing 3-player **continue** end-to-end still produces 3 melodies × 3
   sequential segments in derangement order (regression). New **layers** sim: 3 players → 3 songs,
   each with 3 stacked layers (Melody/Chords/Bass) by 3 distinct authors; drums round validated on a
   4-player sim.
3. **Manual (multi-tab), Layers mode:**
   - Host sets mode=Layers, bars=4, context=previous; start with 3–4 players.
   - Each round shows the correct **role** (Melody→Chords→Bass→Drums) with the right editor
     (piano-roll vs drum grid) and the right read-only context per the host setting.
   - Round 1 is blind; later rounds render/play prior layers behind the draft.
   - Timer + early-Ready advance as before; AFK autosave commits the layer.
   - Results: each song loops with all layers stacked; mute/solo works; the **seed player's** reveal
     controls step layers and **all clients follow** the revealed-layer count; JSON export downloads.
4. **Context settings:** repeat with `all` and `blind` and confirm the read-only layers shown match.
5. **Modularity smoke test:** add a throwaway drum voice file + register it → it appears as a new
   drum-grid lane with no other code changes (then revert). Same for an instrument id on a role.
6. **Regression:** a full continue-mode game still plays start→finish with no console/server errors.
