# 🎵 MusicPhone

A collaborative, real-time web game — **Gartic Phone, but with melodies**. Players take turns
extending melodies they can only partially see: each player receives the **last measure** of the
previous player's work and writes **4 new measures**. After N rounds you get N complete melodies,
each one a chain of every player's contribution.

## Stack
- **Bun** workspaces (runtime + package manager)
- **Elysia** backend (HTTP + native WebSocket) → Render
- **Next.js 15** frontend → Vercel
- **Tone.js** audio, **Zustand** state, **Eden Treaty** typed HTTP

## Quick start
```sh
bun install
bun run dev        # web on :3000, server on :3001
```
Open http://localhost:3000, create a room, share the 4-letter code, and play with 3–8 people.

## Docs
- **[CLAUDE.md](./CLAUDE.md)** — architecture, data models, WebSocket protocol, game flow, Tone.js notes.
- **[PROJECT.md](./PROJECT.md)** — build/run guide, phase breakdown, deployment, verification.

All code, comments and docs are in English. V1 is complete (phases 0–3); see PROJECT.md for the
Phase 4 backlog.
