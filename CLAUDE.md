# CLAUDE.md — MusicPhone Technical Overview

> MusicPhone is a collaborative, real-time web game: **Gartic Phone, but with melodies**.
> Players take turns extending melodies they can only partially see. Each player receives the
> **last measure** of the previous player's work and writes **4 new measures**. After N rounds you
> get N complete melodies, each one a chain of N players' contributions.

This document is the technical map of the project. It is the file Claude (and humans) should read
first. For the step-by-step build/run instructions see **PROJECT.md**.

---

## 1. Stack & hosting

| Layer | Choice |
|---|---|
| Runtime / package manager | **Bun** everywhere (Bun workspaces, isolated linker) |
| Backend | **Elysia** (HTTP + native WebSocket) running on Bun → deployed to **Render** |
| Frontend | **Next.js 15** (App Router, React 19) → deployed to **Vercel** |
| Audio | **Tone.js** (one `PolySynth` per timbre) |
| State (client) | **Zustand** (owns the WebSocket) |
| Type safety (HTTP) | **Eden Treaty** — the web client imports the server's `App` *type* only |
| Type safety (realtime) | Shared discriminated-union message protocol in `@musicphone/shared` |
| Persistence (V1) | **In-memory** room store in the server process (ephemeral) |
| Identity | Anonymous nickname + `playerId` reconnect token in `localStorage` |

### Why these choices
- **Two separate deploys** (Render + Vercel) means we never rely on cross-origin cookies. The
  `playerId` lives in `localStorage` and is sent as a WebSocket query param, which doubles as the
  reconnect token.
- **In-memory** keeps V1 lean; a finished game can still be exported as JSON. Persistence is a
  documented Phase 4 swap behind the `RoomManager` surface.

---

## 2. Architecture

```
musicphone/                      Bun workspace root
├─ apps/
│  ├─ server/   @musicphone/server   Elysia on Bun → Render
│  │  └─ src/
│  │     ├─ index.ts              Elysia app: HTTP routes + /ws, exports `App` type
│  │     ├─ ws/handlers.ts        Dispatch inbound ClientMessage -> RoomManager
│  │     └─ game/
│  │        ├─ room-store.ts      RoomManager: rooms, sockets, timers, game flow
│  │        ├─ rotation.ts        Assignment math + last-measure context extraction
│  │        └─ serialize.ts       Room -> sanitized RoomSnapshot (hides future segments)
│  └─ web/      @musicphone/web      Next.js → Vercel
│     └─ src/
│        ├─ app/page.tsx              Landing (create / join)
│        ├─ app/room/[code]/page.tsx  Phase router: JoinGate | Lobby | Play | Results
│        ├─ store/game-store.ts       Zustand store; owns the WebSocket + autosave
│        ├─ lib/eden.ts               Eden Treaty client + create/join helpers
│        ├─ lib/session.ts            localStorage credentials (playerId / nickname)
│        ├─ lib/audio/engine.ts       Tone.js synths, preview, playNotes scheduler
│        ├─ lib/audio/schedule.ts     Flatten a melody into absolute-step notes
│        └─ components/               PianoRoll, NotePalette, TransportControls,
│                                     RoundTimer, PlayerList, ConfigForm, ResultsPlayer,
│                                     views/Lobby, views/Play
└─ packages/
   └─ shared/   @musicphone/shared    Single source of truth (imported by both apps)
      └─ src/
         ├─ types.ts     Note, Segment, Melody, Player, GameConfig, Room, RoomSnapshot
         ├─ scales.ts    Scale interval tables + pitch helpers
         ├─ messages.ts  ClientMessage / ServerMessage discriminated unions
         └─ schemas.ts   Dependency-free runtime validation for untrusted payloads
```

The server is **authoritative** on phase, the round timer and rotation. The client renders a
sanitized snapshot and sends intents; it never decides game progression.

---

## 3. Data models (`@musicphone/shared/src/types.ts`)

```ts
type ScaleType = "major" | "minor" | "pentatonic";
type Timbre    = "sine" | "triangle" | "sawtooth" | "square";
type Phase     = "lobby" | "playing" | "results";

interface Note    { pitch: number; start: number; length: number; timbre: Timbre } // steps
interface Segment { authorId: string; authorName: string; order: number; notes: Note[] }
interface Melody  { id: string; seedPlayerId: string; segments: Segment[] }
interface Player  { id: string; name: string; connected: boolean; isHost: boolean }

interface GameConfig {
  bpm: number; root: number; scale: ScaleType;
  stepsPerMeasure: number;   // 16 (16th notes)
  measuresPerTurn: number;   // 4
  octaves: number;           // 2 visible octaves
  roundDurationSec: number;
}

interface Room {            // authoritative, server-only
  code: string; hostId: string; phase: Phase; config: GameConfig;
  players: Player[]; round: number; totalRounds: number;
  melodies: Melody[]; roundEndsAt: number; ready: Record<string, boolean>;
}

interface RoomSnapshot {    // sent to clients; melodies only populated at results
  ...Room fields... ; selfId: string; melodies: Melody[];
}
```

**Units.** `pitch` is a MIDI number. `start`/`length` are in **16th-note steps**. One turn is
`stepsPerMeasure * measuresPerTurn = 64` steps. Helper: `stepsPerTurn(config)`.

**Scale locking.** `buildScalePitches(config)` returns the ascending list of in-scale MIDI pitches
over `octaves+1` octaves. The piano roll renders exactly these rows, and `validateNote` rejects any
pitch outside them — so every stored note is guaranteed in-scale.

---

## 4. WebSocket protocol (`@musicphone/shared/src/messages.ts`)

Realtime gameplay is a JSON discriminated union over a single `/ws` connection.

**Client → Server (`ClientMessage`)**

| type | payload | meaning |
|---|---|---|
| `game:start` | — | host starts the game (locks N players) |
| `config:update` | `{ config: Partial<GameConfig> }` | host edits lobby settings |
| `turn:autosave` | `{ notes }` | throttled draft save (timeout fallback) |
| `turn:submit` | `{ notes }` | commit this turn's notes |
| `player:ready` | `{ ready }` | toggle ready (early round advance) |
| `room:leave` | — | leave / disconnect |

**Server → Client (`ServerMessage`)**

| type | payload | meaning |
|---|---|---|
| `room:snapshot` | `{ room: RoomSnapshot }` | full per-player state (sent on every change) |
| `round:started` | `{ round, contextNotes, endsAt }` | new turn; `contextNotes` = previous last measure (read-only) |
| `round:ended` | `{ round }` | a round closed |
| `game:finished` | `{ melodies }` | all rounds done; full results |
| `error` | `{ code, message }` | rejected action (e.g. not host, too few players) |

Identity is carried on the connection query string: `/ws?code=ABCD&playerId=<uuid>`. Reconnecting
with the same `playerId` re-attaches the socket and replays the current snapshot + round context.

---

## 5. Game flow

```
LOBBY                         PLAYING (N rounds)                         RESULTS
─────                         ──────────────────                         ───────
host create ─┐
guests join  ├─ game:start ─► round 0 ─ submit/ready/timer ─► round 1 ─► … ─► game:finished
config edit  ┘                  │  each player gets the last measure        N melodies,
                                │  of the melody assigned to them           each = N segments
                                ▼
                         advance when ALL ready OR timer hits 0
```

**Rotation (`rotation.ts`).** At start, lock `N = players.length`, create `N` melodies (one seed per
player). In round `r`, player at index `i` works on melody `(i + r) % N`. This fixed-step rotation is
a derangement for every round `1..N-1` (nobody gets their own seed back) and visits each melody
exactly once across the N rounds. The read-only context a player sees is `lastMeasureContext(melody)`
— the notes in the final measure of that melody's current tail, normalized to steps `0..15`.

**Round advance.** `RoomManager` runs a server-side `setTimeout` of `roundDurationSec`. A round
advances when the timer fires **or** every connected player is `ready`. On advance, each player's
`pending` (submitted) notes — or their last `autosave` draft as a fallback — are committed as a new
`Segment`, then `round++`. When `round === totalRounds` the phase flips to `results`.

**Disconnects.** In the lobby a leaver is removed and the host is reassigned. Mid-game a player is
marked `connected:false` but keeps their slot so the melody chain stays intact; their autosaved draft
still gets committed at round end. An empty room is reaped after 60s.

---

## 6. Tone.js considerations

- **AudioContext gate.** Browsers only start audio after a user gesture. `ensureAudio()` awaits
  `Tone.start()` and is called from click handlers (palette, play, note placement) before any sound.
- **Per-timbre polyphony.** One `Tone.PolySynth` per timbre (`sine/triangle/sawtooth/square`), all
  `.toDestination()`. A note's `timbre` selects its synth at playback, so a single turn — and the
  final melody — can layer all four.
- **Timing.** A 16th-note lasts `60 / bpm / 4` seconds (`stepSeconds`). `playNotes()` builds a
  `Tone.Part` with event times in seconds, drives a playhead via `Tone.Loop` + `Tone.getDraw()`, and
  schedules an end callback. Results playback flattens a melody with `flattenMelody()` (each segment
  offset by `order * stepsPerTurn`).
- **Cleanup.** Every play returns a `stop()` that disposes the Part/Loop and resets the Transport;
  components call it on unmount to avoid dangling schedules.

---

## 7. State & sync strategy

- **Server = source of truth.** Clients send intents (`ClientMessage`); the server mutates the `Room`
  and broadcasts a fresh, per-player `RoomSnapshot` after every change.
- **Snapshots are sanitized.** Melodies are withheld until `results`, preserving the telephone
  surprise. `round:started` delivers only the single read-only context measure for the local player.
- **Client store (Zustand).** Owns the WebSocket (kept outside React state), auto-reconnects on
  unexpected close, debounces `turn:autosave` (600 ms), and exposes typed actions. The local `draft`
  is cleared on each `round:started`.

---

## 8. Brainstorm Q&A (the 23 master-prompt questions, V1 answers)

**Game mechanics**
1. *Timing/rotation:* host-configurable countdown (default 3 min) **+ early Ready**; advances on
   all-ready or timeout (auto-submits the latest autosave).
2. *Player count:* flexible **3–8**; N players → N melodies of `4·N` measures.
3. *Scale/BPM attribution:* host picks in the lobby (`config:update`), locked at `game:start`.
4. *Preview of last measure:* greyed **read-only notes on the grid + playback**; only the previous
   single measure is revealed.
5. *Continuity constraint:* free — the grid is scale-locked, which keeps results consonant.
6. *Anonymity/credits:* nickname per player; final playback credits each segment's author.
7. *Replay:* V1 shows the final result + JSON export; full step-replay is Phase 4.

**Interface & interaction**
8. *Grid resolution:* **16th notes**, 16 steps/measure, 64 steps/turn.
9. *Sound feedback:* note preview on placement, local **Play** of the draft, live playhead cursor.
10. *Sound selection:* a 4-button **timbre palette** (per-note), colour-coded.
11. *Undo/reset:* click a note to delete; **Clear** wipes the draft.
12. *Note duration:* **variable** — click-drag to draw length; stored as `{start, length}`.
13. *Scales:* **Major, Natural Minor, Pentatonic**, any root.
14. *Piano-roll size:* fixed **2 octaves**, horizontally scrollable across the 5 measures.

**Technical & data**
15. *Persistence/export:* in-memory rooms; **JSON export** of the finished melodies (WAV/MIDI later).
16. *Visual history:* results show per-segment **author labels + colours**.
17. *Player data:* nickname required (1–20 chars), otherwise anonymous.
18. *Resource limits:* empty rooms reaped after 60s; note count capped per turn; payloads validated.

**Future extensions (documented, out of V1 scope)**
19. *Parallel Harmony mode* — simultaneous layers merged instead of sequential rotation.
20. *Remix mode* — mutate 4 random measures of an existing finished melody.
21. *Public gallery* — publish/browse the best melodies (needs persistence).
22. *Free collective* — N players accumulate freely for a fixed session length.
23. *Notation* — render a staff alongside the piano roll.

---

## 9. Conventions

- Everything (code, comments, docs, UI copy) is in **English**.
- Strict TypeScript end-to-end; `@musicphone/shared` is dependency-free and the single source of
  truth for types, the protocol, and validation.
- Minimal styling: hand-written CSS in `globals.css`, no UI framework.
- The web app imports the server only via `import type { App }` — erased at build, never bundled.
