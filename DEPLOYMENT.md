# Deploying MusicPhone

Everything runs on one VPS under [Dokploy](https://dokploy.com): the **web app**
and the **game server** as two Applications built from this repo, plus a
**managed Redis** that holds the rooms.

Both images build from the repo root — `@musicphone/shared` ships as TypeScript
source and is reached through the Bun workspace symlink, so a context of
`apps/web` or `apps/server` alone could not resolve it.

## 1. DNS

Point two `A` records at the VPS:

| Host               | Serves          |
| ------------------ | --------------- |
| `play.example.com` | the web app     |
| `api.example.com`  | the game server |

## 2. Redis

Dokploy → **Databases → Redis**. Create it, then copy its **internal**
connection URL — the server reaches it over Dokploy's private network, so this
never needs to be exposed publicly.

## 3. Server application

New **Application** from this repository, branch `master`:

| Setting             | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Build type          | `Dockerfile`                                                       |
| Dockerfile path     | `apps/server/Dockerfile`                                           |
| Docker context path | `.`                                                                |
| Domain              | `api.example.com` → container port **3001**, HTTPS + Let's Encrypt |

Environment:

| Variable     | Value                                                 |
| ------------ | ----------------------------------------------------- |
| `WEB_ORIGIN` | `https://play.example.com` — exact, no trailing slash |
| `REDIS_URL`  | the internal URL from step 2                          |
| `PORT`       | `3001`                                                |

`WEB_ORIGIN` is not optional in spirit: left unset the server allows **any**
origin and says so at startup. It is what the WebSocket upgrade is checked
against, and since CORS does not cover upgrades, it is the only thing standing
between the game and a socket opened from someone else's page.

Under **Advanced → Swarm settings**, set the update config to
`Order: start-first` with `FailureAction: rollback` for zero-downtime deploys.

## 4. Web application

A second **Application** from the same repository:

| Setting             | Value                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Build type          | `Dockerfile`                                                        |
| Dockerfile path     | `apps/web/Dockerfile`                                               |
| Docker context path | `.`                                                                 |
| Domain              | `play.example.com` → container port **3000**, HTTPS + Let's Encrypt |

**Build-time argument** (not an environment variable):

| Argument                 | Value                     |
| ------------------------ | ------------------------- |
| `NEXT_PUBLIC_SERVER_URL` | `https://api.example.com` |

`NEXT_PUBLIC_*` values are inlined into the bundle during `next build`, so this
has to be present at build time; setting it as a runtime variable does nothing.
Changing it later means a rebuild, not a restart. A build without it fails
deliberately — the alternative was a bundle silently pointing at
`localhost:3001`, which works for whoever built it and for nobody else.

The client derives the WebSocket URL from the same value, so `https://` becomes
`wss://` on its own. There is no separate socket variable.

**Deploy the server first**, then the web app, which bakes in the API URL.
Enable auto-deploy on both so a push to `master` redeploys them.

## 5. Check the deploy

- `https://api.example.com/health` returns `{"ok":true,...}`.
- The server log line reads `storage: redis`, not `storage: memory`. `memory`
  means `REDIS_URL` did not arrive, and every game will die with the next deploy.
- Neither startup warning (`WEB_ORIGIN is unset`, `REDIS_URL is unset`) appears.
- `https://play.example.com` loads, and creating a room opens a socket on
  `wss://api.example.com/ws` that stays open.

## 6. Smoke test the live pair

1. Open the site in two browsers, create a room in one, join with the link in the other.
2. Start the game; both should see the wheel, then the countdown, then the editor.
3. Place notes in both, press play, submit. The round should advance when both are ready.
4. Let one round run out on the timer instead of submitting — it should advance anyway.
5. Reach the results screen and complete the reveal to the end.
6. Close the presenter's tab mid-reveal: the host must still be able to finish.
7. Kill the wifi on one client for ~5s: it should reconnect with its notes and its
   sound intact, and without replaying the round intro.
8. Redeploy the server application mid-game: clients back off and reconnect, and
   the game resumes with its round timer where it was.
9. Draw notes and drag note lengths on a real tablet.

## Trying the images before you deploy

```bash
docker compose -f docker-compose.local.yml up --build   # → http://localhost:3000
```

This runs the exact two images plus Redis locally. Nothing about the container
build is covered by the test suite, so this is the cheapest way to catch a
broken image.

## Operating notes

- **Logs.** Both servers log on stdout, so Dokploy's log view is the whole story.
  Room lifecycle, refused origins and rate-limit rejections all appear there.
- **Rooms expire on their own.** Every room carries a four-hour Redis TTL that is
  pushed back on each write, and an empty room is collected a minute after the
  last player leaves. Nothing needs manual cleanup.
- **Rate limits** are per IP: 5 room creations/minute, 20 joins/minute, and 40
  socket messages per burst. Traefik sets `X-Forwarded-For` and the limiter
  prefers it, so limits apply to real clients rather than to the proxy. A player
  who trips one gets a 429 with an explanation rather than a silent failure.
- **Building on the VPS.** `next build` wants roughly 2 GB of RAM. If deploys get
  killed on a small box, add swap, or move the builds into GitHub Actions and
  have Dokploy pull the images from a registry instead.
- **Capacity.** One instance holds all sockets for a room. The store already
  guards writes with a version check and the bus is behind an interface, so a
  second instance is a configuration change rather than a rewrite — but until
  then, run exactly one.
