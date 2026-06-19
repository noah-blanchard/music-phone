# MusicPhone — V2 UI: Full-screen "Dark Hardware Synth" Redesign

## Context

V1 of MusicPhone is built and working (real-time rooms, rotation, piano-roll editing, results +
JSON export). It functions, but it **looks like a website with cards**, not a game. This task is a
presentation overhaul: make it feel like a **game** — full-screen, tactile, a bit retro — with the
**piano roll filling the entire screen** and easy to navigate. No game logic, protocol, store, or
server behavior changes (the V1 bug fixes stay); this is UI, motion, fonts, and audio "juice".

All design forks were resolved with the user (see **Design language**). Sequence: nail the
**play screen + full-screen piano roll first**, then theme the rest.

## Design language (locked)

| Axis | Decision |
|---|---|
| Art direction | **Dark vintage-synth hardware** — brushed charcoal/black metal, beveled panels, warm **amber/orange LEDs**, VU meters, knobs & toggles, cream labels |
| Theme | **Dark + neon/amber glow** (near-black canvas so notes/playhead glow) |
| Typography | **Display** = Orbitron (titles/logo) · **Mono** = IBM Plex Mono (labels, LED readouts) via `next/font` |
| Juice | **Full** — UI click/hover blips (Tone.js), note-placement pop, glowing playhead sweep + key/row lighting, motion transitions |
| Piano roll | **Fits entirely, no scroll** (responsive cells); **full chromatic keyboard** rows with out-of-scale rows **dimmed & locked**; vintage **piano-keyboard gutter** that lights up |
| Play layout | **Top HUD bar** (round, LED timer, room code) + **bottom hardware dock** (timbre keys, Play, Clear, Submit); roll fills the middle |
| Transitions | **Cinematic splash + 3·2·1 countdown** between rounds; results **reveal** animation (via `motion/react`) |
| Lobby | **Mixing-console** waiting room — player channel strips, big LED code, knob/toggle settings, chunky illuminated START |
| Title screen | **Full title screen** — glowing logo, animated VU/grid background, nickname entry, CREATE/JOIN hardware buttons |
| Styling | **Expand custom CSS into a design system** (tokens + reusable hardware classes, split files); no UI framework |
| Identity | **Retro avatar glyph + signature color** per player, reused in lobby / ready lights / results |
| Devices | **Desktop-first, graceful on tablet**; phones get a "best on a larger screen" notice |

## Tech additions

- **`motion`** (the `motion/react` package, successor to framer-motion): `bun add --cwd apps/web motion`.
  Use for overlays/countdown, title & lobby entrances, results reveal, and button micro-interactions.
  Keep it **optimized**: animate only `transform`/`opacity`, use `AnimatePresence` for mount/unmount,
  `layout` sparingly, and honor `prefers-reduced-motion`.
- **`next/font/google`**: Orbitron + IBM Plex Mono, exposed as `--font-display` / `--font-mono`.
- No other deps. Server, protocol (`@musicphone/shared/messages`), and Zustand store are untouched
  except the two small additions noted below (chromatic helper; UI-sfx + round cue).

## File-by-file plan

### 1) Design system — CSS tokens & hardware primitives
Restructure styling from one `globals.css` into a small system under `apps/web/src/styles/`,
`@import`-ed from `app/globals.css`:
- `tokens.css` — CSS variables for the hardware palette (`--metal`, `--metal-2`, `--bevel-hi/lo`,
  `--amber`, `--amber-glow`, `--cream`, `--vu-green/red`), timbre **neon** colors, radii, shadows,
  and font vars. Reset + base live here.
- `hardware.css` — reusable classes: `.panel` (beveled brushed-metal), `.screen` (dark CRT surface
  with subtle scanlines/inner-glow, used by the roll and LED displays), `.led` / `.led-amber`
  (glowing mono readout), `.hw-btn` (chunky beveled button with press depth; `.hw-btn--primary`
  illuminated, `.hw-btn--danger`), `.knob`, `.toggle`, `.vu`, `.chip`.
- `piano-roll.css` — full-screen roll styles (replaces the old `.pr-*` block): keyboard gutter,
  white/black keys, lit-key state, chromatic rows, in-scale vs locked rows, beat/measure lines,
  context region, glowing notes + playhead, note-flash.
Delete the card/`.page`/`.grid-2` website styles that no longer apply.

### 2) Audio juice — `lib/audio/sfx.ts` (new) + small `engine.ts` addition
A dedicated low-volume synth for UI: `uiClick()`, `uiHover()`, `uiConfirm()`, `countdownBlip(n)`,
all gated on the existing `ensureAudio()` in `lib/audio/engine.ts`. Hardware buttons and the palette
call these. Reuse the existing `previewNote`/`playNotes` for musical sound (unchanged).

### 3) Full-screen piano roll — rewrite `components/PianoRoll.tsx` (+ shared helper)
- Add `buildChromaticRange(config)` to `packages/shared/src/scales.ts` (returns every MIDI pitch in
  the visible window). `isInScale`/`buildScalePitches` stay for **server validation** (notes remain
  in-scale, so the protocol is unchanged).
- Render **all chromatic rows**; in-scale rows are active, out-of-scale rows get a `--locked` class
  and `onMouseDown` ignores them (keeps the scale-lock mechanic, now visualized).
- **Responsive sizing**: measure the container via `ResizeObserver`; compute `cellW = width/totalSteps`
  and `rowH = height/rows` so the grid fills the viewport with no scroll. Replace the fixed
  `CELL_W`/`ROW_H` constants with state derived from the measured size.
- **Keyboard gutter**: a vertical piano keyboard aligned to rows (white/black keys, octave labels)
  that lights up when a note on its row triggers during playback.
- **Playhead**: glowing amber sweep; triggered notes flash and their key/row lights (driven by the
  existing `playStep` prop). Preserve current interactions (click-drag to draw, click to delete).

### 4) Play screen — rewrite `components/views/Play.tsx`
Full-viewport flex column: **top HUD** (`Round X/N`, LED `RoundTimer`, room code chip) · **roll**
fills remaining space (the new `PianoRoll` inside a `.screen`) · **bottom dock** (`.panel`) holding
the restyled `NotePalette` timbre keys, `TransportControls` Play, Clear, ready count, and the Submit
button. The room page must give Play the full height (see §7).

### 5) Overlays & transitions — `components/RoundOverlay.tsx` (new, `motion/react`)
Full-screen `AnimatePresence` overlay: `ROUND n / N` → "a melody arrives" beat → `3·2·1` countdown
(with `countdownBlip`) before revealing the roll. Triggered by a new **round cue** in the store: on
`round:started`, bump a `roundCue` counter (store-only addition; no protocol change). Also a results
**reveal** animation. Respect reduced-motion (skip to final state).

### 6) Restyle the other screens (after the play screen)
- **Title screen** — rewrite `app/page.tsx`: glowing Orbitron logo, animated VU/grid background,
  nickname input, CREATE/JOIN as `.hw-btn--primary`. Motion entrance.
- **Lobby** — rewrite `components/views/Lobby.tsx` + `ConfigForm.tsx`: mixing-console panel, player
  **channel strips** (new `components/PlayerAvatar.tsx` glyph+color), big LED room code, settings as
  knob/toggle, illuminated START with staggered slot animation.
- **Results** — restyle `components/ResultsPlayer.tsx`: keep the working playback/JSON export; add a
  motion reveal, author **avatars + signature colors** on segment strips, hardware play buttons.
- **Shared bits** — `RoundTimer.tsx` → `.led-amber` readout; `PlayerList.tsx` → channel strips;
  `NotePalette.tsx` / `TransportControls.tsx` → `.hw-btn` hardware keys.

### 7) Full-bleed shell — `app/layout.tsx` + `app/room/[code]/page.tsx`
Wire the fonts and make the app fill the viewport (`100dvh`, `overflow: hidden` on game screens).
Remove the `.page` max-width wrappers around Lobby/Play/Results so each screen is full-screen. Add a
small `components/SmallScreenNotice.tsx` shown under a width breakpoint (graceful tablet, phone notice).

## Sequence
1. Tokens + hardware primitives + fonts (foundation).
2. Full-screen PianoRoll (responsive, chromatic keyboard, glow) + Play HUD/dock — **the centerpiece**.
3. RoundOverlay + countdown + audio sfx.
4. Title screen → Lobby/console → Results, plus PlayerAvatar + shared widget restyles.
5. Full-bleed shell + small-screen notice + reduced-motion pass.

## Critical files
- New: `apps/web/src/styles/{tokens,hardware,piano-roll}.css`, `lib/audio/sfx.ts`,
  `components/RoundOverlay.tsx`, `components/PlayerAvatar.tsx`, `components/SmallScreenNotice.tsx`.
- Rewrite: `components/PianoRoll.tsx`, `components/views/Play.tsx`, `components/views/Lobby.tsx`,
  `app/page.tsx`, `components/ResultsPlayer.tsx`, `app/globals.css`, `app/layout.tsx`,
  `app/room/[code]/page.tsx`.
- Light edits: `components/{NotePalette,TransportControls,RoundTimer,PlayerList,ConfigForm}.tsx`,
  `packages/shared/src/scales.ts` (add `buildChromaticRange`), `store/game-store.ts` (add `roundCue`).

## Verification
1. `bun run typecheck` clean across workspaces; `bun run dev` and open `http://localhost:3000`.
2. **Title** screen renders full-screen with logo/VU motion; create + join work as before.
3. **Lobby** shows the console with player channel strips, LED code, knob/toggle settings, START.
4. **Play**: piano roll fills the screen with **no scrollbars** at common desktop sizes and on a
   resized window (ResizeObserver re-fits); chromatic keyboard shows locked out-of-scale rows; only
   in-scale notes are placeable; Play sweeps a glowing amber playhead that lights keys/notes.
5. **Round transitions**: 3·2·1 countdown splash plays between rounds with blips; reduced-motion OS
   setting skips animations without breaking layout.
6. **Results**: reveal animation, author avatars/colors, playback + JSON export still work.
7. Regression: 3-tab game start→finish still completes; no console errors; server untouched.
