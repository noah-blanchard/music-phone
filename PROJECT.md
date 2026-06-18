# PROJECT.md — MusicPhone Implementation Plan

Build/run guide and phased roadmap. For the architecture map see **CLAUDE.md**.

V1 status: **complete and verified** — shared/server/web all typecheck, the server passes a full
3-player end-to-end game simulation, and the web app builds for production. Phases 0–3 are done;
Phase 4 is the documented backlog.

---

## Prerequisites

- **Bun ≥ 1.1** (developed on 1.3.13). Bun is the only required toolchain — it is the package
  manager, the TypeScript runtime for the server, and the script runner.
- A Chromium/Firefox/Safari browser for the client (Web Audio + WebSocket).

---

## Quick start (local)

```sh
# from the repo root
bun install

# env (optional locally — sensible defaults are baked in)
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local

# run both apps together (server :3001, web :3000)
bun run dev

# …or individually
bun run dev:server     # Elysia on http://localhost:3001
bun run dev:web        # Next.js on http://localhost:3000
```

Open `http://localhost:3000`, create a room, then open more tabs (or share the 4-letter code) to
join with 3–8 players.

### Useful scripts
| Command | Effect |
|---|---|
| `bun run dev` | run web + server concurrently (`--filter '*'`) |
| `bun run dev:server` / `bun run dev:web` | run one app |
| `bun run build` | build all workspaces |
| `bun run typecheck` | `tsc --noEmit` across all workspaces |

---

## Workspace layout

```
package.json            workspaces: ["apps/*", "packages/*"], dev/build/typecheck scripts
tsconfig.base.json      strict shared compiler options
apps/server             @musicphone/server  (Elysia, Bun)
apps/web                @musicphone/web      (Next.js)
packages/shared         @musicphone/shared   (types, protocol, scales, validation)
```

Bun's isolated linker symlinks each workspace's deps into its own `node_modules`
(`apps/web/node_modules/next`, `apps/server/node_modules/elysia`, …). The root `node_modules`
holds only the `.bun` store — this is expected.

---

## Dependencies (already installed)

```sh
# server
bun add --cwd apps/server elysia @elysiajs/cors @musicphone/shared
bun add --cwd apps/server -d @types/bun typescript

# web
bun add --cwd apps/web next react react-dom tone zustand @elysiajs/eden @musicphone/shared
bun add --cwd apps/web -d @musicphone/server @types/node @types/react @types/react-dom typescript
```

`@musicphone/server` is a **dev** dependency of the web app: it is consumed only as
`import type { App }` for Eden Treaty and never enters the bundle.

---

## Phase breakdown (what was built)

### Phase 0 — Setup ✅
Bun workspace, three packages, strict TS configs, `.gitignore`, env examples. Health route
(`GET /health`) + Eden Treaty smoke test.

### Phase 1 — Core musical UI ✅
- `packages/shared/scales.ts` — interval tables + `buildScalePitches`, `noteLabel`, `midiToToneNote`.
- `lib/audio/engine.ts` — gesture-gated AudioContext, 4 `PolySynth`s, `previewNote`, `playNotes`
  (Part + playhead + end callback), `stepSeconds`.
- `components/PianoRoll.tsx` — scale-locked grid, click-drag to draw variable-length notes, click to
  delete, greyed read-only context measure, playhead cursor.
- `NotePalette`, `TransportControls`, `ConfigForm`. Deliverable: a playable single-turn editor.

### Phase 2 — Realtime rooms & rotation ✅
- `game/room-store.ts` (`RoomManager`) — in-memory rooms, socket registry, server-side round timer,
  autosave/submit/ready, derangement rotation, snapshot broadcasting, reconnect sync, room reaping.
- `game/rotation.ts`, `game/serialize.ts`, `ws/handlers.ts`, Elysia `/ws` in `index.ts`.
- HTTP `POST /rooms`, `POST /rooms/:code/join`, `GET /rooms/:code`.
- Client: `store/game-store.ts` (Zustand owns the socket, debounced autosave, auto-reconnect),
  `lib/session.ts`, landing + room phase router, `views/Lobby`, `views/Play`, `RoundTimer`,
  `PlayerList`.

### Phase 3 — Playback & export ✅
- `lib/audio/schedule.ts` — `flattenMelody`, `melodySteps`.
- `components/ResultsPlayer.tsx` — sequential playback of each finished melody (per-note timbre),
  author-coloured segment strip, **JSON export** download.

### Phase 4 — Backlog (not built)
SQLite persistence + full step-replay; WAV (`Tone.Offline`) / MIDI export; Parallel-Harmony and
Remix modes; public gallery; reconnect hardening; per-IP rate limits and max-concurrent-room caps.

---

## Implementation notes (the thorny bits)

- **Scale-locked grid math.** Rows = `buildScalePitches(config)` reversed (high pitch on top). The
  editable region starts after one context measure: a grid column `c` maps to step `c - stepsPerMeasure`.
  `validateNote` re-checks `isInScale` server-side so a tampered client cannot inject out-of-scale notes.
- **Step → Tone time.** Seconds per step = `60 / bpm / 4`. Event time = `start * dt`; duration =
  `length * dt * 0.95` (small gap so repeated notes retrigger). Never trust the client clock — the
  playhead derives its step from `Tone.getTransport().seconds`.
- **Server-side timer & auto-submit.** The round `setTimeout` lives in `RoomManager`. On expiry
  `advanceRound` commits each player's `pending` notes, falling back to their last `autosave`. Early
  advance fires when every *connected* player is ready.
- **Eden across two deploys.** Type-only import (`import type { App }`) gives end-to-end typing
  without bundling server code. At runtime the client targets `NEXT_PUBLIC_SERVER_URL`; the WS URL is
  derived by swapping `http`→`ws`.
- **No cross-origin cookies.** `playerId` is returned by the create/join HTTP calls, stored in
  `localStorage`, and passed on the WS query string — it is also the reconnect token.

---

## Environment variables

**Server (`apps/server/.env`)**
```
PORT=3001                          # Render injects PORT automatically
WEB_ORIGIN=http://localhost:3000   # CORS allow-list; set to the Vercel URL in prod
```

**Web (`apps/web/.env.local`)**
```
NEXT_PUBLIC_SERVER_URL=http://localhost:3001   # Render URL in prod (https://…)
```

---

## Deployment

**Backend → Render** (Bun web service)
- Build command: `bun install`
- Start command: `bun run apps/server/src/index.ts` (or `bun --filter @musicphone/server start`)
- Env: `WEB_ORIGIN=https://<your-app>.vercel.app` (Render provides `PORT`).

**Frontend → Vercel** (Next.js)
- Root directory: `apps/web` (Vercel detects Next).
- Env: `NEXT_PUBLIC_SERVER_URL=https://<your-service>.onrender.com`.
- Because the shared package is workspace-linked TS source, keep the repo root as the Vercel build
  context (or enable workspace install) so `@musicphone/shared` resolves; it is transpiled via
  `transpilePackages` in `next.config.mjs`.

---

## Verification performed

1. `tsc --noEmit` passes for `shared`, `server`, and `web`.
2. Server boots; `GET /health` and `POST /rooms` respond correctly.
3. A scripted 3-player WebSocket game runs start→finish: **3 melodies, each 3 segments by 3 distinct
   authors** in the expected derangement order (`Alice#0 → Carol#1 → Bob#2`, etc.).
4. `next build` produces an optimized production build (4 routes) with no type errors.

### Manual end-to-end checklist
- [ ] Single editor: only in-scale rows are placeable; Play matches BPM; the playhead tracks.
- [ ] 3 tabs: create + join; host starts; each player sees the previous **last measure** read-only.
- [ ] Timer counts down; early **Ready** by all advances the round immediately.
- [ ] Results: each melody plays with correct per-note timbres + author labels; JSON export downloads.
- [ ] Refresh a tab mid-game → reconnects and replays the current snapshot.
- [ ] Negatives: non-host cannot start; out-of-scale payloads rejected; AFK player auto-submitted at 0.
