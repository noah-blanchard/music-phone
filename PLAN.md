# MusicPhone — V1 Plan (playable online, realtime, first game mode)

## Context

`MusicPhone` is a greenfield collaborative web game: Gartic Phone, but with music. Players take turns
extending melodies they can only partially see — each player receives the **last measure** of the previous
player's work and writes 4 new measures, so melodies mutate as they rotate around the room. The repo
currently contains only `MASTER_PROMPT.md`. The goal of this work is to ship **V1**: a real online,
realtime game with the first (sequential "Continue the Melody") mode, plus the two required design docs
(`CLAUDE.md`, `PROJECT.md`). Everything — code, comments, docs — is in **English**.

All design forks were resolved with the user (see **Locked decisions**). This plan is the build spec.

## Locked decisions

| Area | Decision |
|---|---|
| Runtime / PM | **Bun everywhere** (Bun workspaces, `bun` as package manager + server runtime) |
| Hosting | Elysia backend → **Render** (Bun); Next.js frontend → **Vercel** |
| Persistence (V1) | **In-memory** room store in the server process (ephemeral); DB deferred to Phase 4 |
| Lobby / rotation | **Flexible N (3–8)** players → N melodies, each rotates through all N players → 4·N measures each |
| Round flow | **Countdown timer + early "Ready"**; round advances when timer hits 0 OR all players ready |
| Grid | **16th notes**, 16 steps/measure → 64 steps per 4-measure turn, 4/4 |
| Notes | **Variable length** `{pitch, start, length, timbre}`, drag right edge to resize |
| Scales | **Major + Natural Minor + Pentatonic**, root selectable; grid locked to in-scale pitches (~2 octaves) |
| Output | **In-app playback** (Tone.Transport) + **JSON export**; WAV/MIDI deferred |
| Identity | **Nickname + anonymous cookie session** (httpOnly `playerId` for reconnect) |
| Previous-turn preview | Last measure shown **read-only on the grid + playback**; continuation otherwise free |
| Timbres | **Per-note** palette of 4 synths (sine/triangle/saw/square); each note stores its timbre |

## Architecture

```
musicphone/                      Bun workspace root (bun.lockb, package.json "workspaces")
├─ apps/
│  ├─ server/                    Elysia on Bun  → Render
│  │  └─ src/
│  │     ├─ index.ts             Elysia app: HTTP + WS, exports `App` type for Eden
│  │     ├─ ws/protocol.ts       WS message discriminated unions (re-exports shared)
│  │     ├─ ws/handlers.ts       create/join/start/submit/ready/leave handlers
│  │     ├─ game/room-store.ts   Map<code, Room> in-memory store + lifecycle
│  │     ├─ game/rotation.ts     assignment(round, players) derangement logic
│  │     ├─ game/timer.ts        per-room round countdown + auto-advance
│  │     └─ game/serialize.ts    room → client snapshot (hide future segments)
│  └─ web/                       Next.js App Router → Vercel
│     └─ src/
│        ├─ app/page.tsx                 Landing: create / join
│        ├─ app/room/[code]/page.tsx     Phase-driven: lobby | playing | results
│        ├─ lib/eden.ts                  Eden Treaty client (NEXT_PUBLIC_SERVER_URL)
│        ├─ lib/ws.ts                     WS connection + reconnect
│        ├─ lib/audio/engine.ts           Tone.js: 4 PolySynths, AudioContext gate
│        ├─ lib/audio/schedule.ts         steps→time, Tone.Part builders for playback
│        ├─ lib/scales.ts                 scale → allowed MIDI pitches (mirror of shared)
│        ├─ store/game-store.ts           Zustand: room snapshot + local note draft
│        └─ components/
│           ├─ PianoRoll.tsx              grid, place/drag/resize notes, read-only context rows
│           ├─ NotePalette.tsx            timbre selector + clear/undo
│           ├─ TransportControls.tsx      play/stop draft, metronome toggle
│           ├─ RoundTimer.tsx             countdown + Ready button
│           ├─ PlayerList.tsx             roster + ready/connection state
│           ├─ ConfigForm.tsx             host: bpm, root, scale, round duration
│           └─ ResultsPlayer.tsx          play each finished melody, per-segment author labels, JSON export
└─ packages/
   └─ shared/                    Single source of truth, imported by both apps
      └─ src/
         ├─ types.ts             Note, Segment, Melody, Player, GameConfig, Room, Phase
         ├─ messages.ts          ClientMessage / ServerMessage discriminated unions
         ├─ scales.ts            ScaleType, scale interval tables, pitch helpers
         └─ schemas.ts           TypeBox/Zod validation for inbound WS payloads
```

**Type-safety:** `apps/web` depends on `apps/server` (workspace) only for its exported `App` type → Eden Treaty
gives end-to-end typed HTTP. Realtime gameplay goes over the native Elysia **WebSocket** using the
discriminated-union protocol in `packages/shared`. In prod the two deploys talk via `NEXT_PUBLIC_SERVER_URL`
(+ `wss://`), with CORS/credentials configured for the cookie session.

## Data models (`packages/shared/src/types.ts`)

```ts
export type ScaleType = 'major' | 'minor' | 'pentatonic';
export type Timbre = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type Phase = 'lobby' | 'playing' | 'results';

export interface Note { pitch: number; start: number; length: number; timbre: Timbre } // start/length in steps
export interface Segment { authorId: string; authorName: string; order: number; notes: Note[] }
export interface Melody  { id: string; seedPlayerId: string; segments: Segment[] }     // grows as it rotates
export interface Player  { id: string; name: string; connected: boolean; isHost: boolean }

export interface GameConfig {
  bpm: number; root: number; scale: ScaleType;
  stepsPerMeasure: 16; measuresPerTurn: 4; octaves: 2; roundDurationSec: number;
}

export interface Room {
  code: string; hostId: string; phase: Phase; config: GameConfig;
  players: Player[]; round: number; totalRounds: number;       // totalRounds === players.length at start
  melodies: Melody[]; roundEndsAt: number; ready: Record<string, boolean>;
}
```

**Rotation (`rotation.ts`):** at game start, lock N = players.length, create N melodies (one seed each).
Round `r`: player at index `i` edits melody index `(i + r) % N` (a fixed-step rotation = derangement for r>0,
and nobody revisits a melody within N rounds). Each round the server hands the player only the **last measure**
(steps 48–63) of that melody's current tail as read-only context.

## WebSocket protocol (`packages/shared/src/messages.ts`)

Client→Server: `room:create {nickname, config}` · `room:join {code, nickname}` · `room:leave` ·
`game:start` (host) · `turn:submit {notes}` · `player:ready {ready}` · `turn:autosave {notes}` (throttled).

Server→Client: `room:snapshot {room}` (sanitized — future segments hidden) · `round:started {round, contextNotes, endsAt}` ·
`round:ended {round}` · `game:finished {melodies}` · `error {code, message}`.

Server is authoritative on phase, timer, and rotation. Timer fires server-side; on expiry it auto-submits the
latest autosaved draft per player and advances. Reconnect: cookie `playerId` re-attaches the socket to its
`Player` and replays the current snapshot.

## Implementation phases

**Phase 0 — Setup.** Init Bun workspace; scaffold `apps/server` (Elysia + `@elysiajs/cors`, `@elysiajs/eden`),
`apps/web` (`create-next-app`, then add `tone`, `zustand`, `@elysiajs/eden`), `packages/shared`. Wire workspace
deps, tsconfig paths, env files. Health-check route + Eden smoke test.

**Phase 1 — Core musical UI (no network).** `scales.ts` pitch tables; `PianoRoll` (render in-scale rows over 2
octaves, click-to-place, drag-to-move, edge-drag to resize, delete); `NotePalette` timbre select; Tone.js
`engine.ts` (gesture-gated AudioContext, 4 PolySynths) + `schedule.ts`; `TransportControls` to audition the
local draft; `ConfigForm`. Deliverable: a fully playable single-player 4-measure editor.

**Phase 2 — Realtime rooms & rotation.** Elysia WS + `room-store`, `rotation`, `timer`, `serialize`; cookie
session; client `ws.ts` + Zustand wiring; landing create/join; lobby with roster + host start; play phase with
read-only context measure, autosave, submit/ready, `RoundTimer`; full create→rotate→finish loop for N players.

**Phase 3 — Playback & export.** `ResultsPlayer`: sequentially schedule all N melodies (Tone.Part, per-note
timbre, per-segment author labels/colors), play/stop, and **JSON export** (download finished `Melody[]`).

**Phase 4 — (deferred, documented only).** SQLite persistence + replay; WAV (Tone.Offline) / MIDI export;
parallel-harmony & remix modes; public gallery; reconnect hardening; rate limits / max concurrent rooms.

## Deliverable docs (created during execution, in English)

- **`CLAUDE.md`** — architecture overview (ASCII diagram), data models w/ TS types, WS event tables
  (client→server / server→client), full game flow, Tone.js scheduling/polyphony/timing notes, the brainstorm
  Q&A (all 23 master-prompt questions answered with the locked decisions + defaults).
- **`PROJECT.md`** — the phased task breakdown above with exact `bun` commands, file-creation checklist,
  and implementation hints for the thorny bits (scale-locked grid math, step→Tone time mapping, server-side
  timer/auto-submit, Eden type sharing across two deploys, cookie auth + CORS credentials).

## Exact setup commands (Phase 0)

```sh
mkdir musicphone && cd musicphone
bun init -y                                  # root; set "workspaces": ["apps/*","packages/*"], private:true
mkdir -p apps packages
# shared
cd packages && mkdir shared && cd shared && bun init -y && cd ../..
# server
cd apps && mkdir server && cd server && bun init -y
bun add elysia @elysiajs/cors @elysiajs/eden && cd ../..
# web
cd apps && bun create next-app web --ts --app --tailwind --eslint --src-dir --no-import-alias && cd web
bun add tone zustand @elysiajs/eden && cd ../..
bun install
```

## Verification (end-to-end)

1. `bun run dev` server (Render-style Bun process) + `bun run dev` web (Next on Vercel-style) locally.
2. Single-player editor: place/resize notes on a scale-locked grid, audition with Tone.js — confirm only
   in-scale pitches are selectable and playback timing matches BPM.
3. Open **3 browser tabs**, create a room in one, join with the others; start a game. Verify each player sees
   the previous player's **last measure** read-only + playback, and the timer/early-Ready advances rounds.
4. Play through all N rounds; on results, play each finished melody (correct per-note timbres + author labels)
   and download the JSON export; re-import sanity-check the structure.
5. Mid-game, refresh a tab → cookie session reconnects and replays the current snapshot.
6. Negative checks: out-of-scale input rejected, non-host cannot start, AFK player auto-submitted at timer 0.
```
