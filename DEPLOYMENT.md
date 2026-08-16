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

New **Application**. Both applications are configured identically except for one
field — the Dockerfile path — since they are two images built from the same repo.

**Provider** panel:

| Field        | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| Provider     | Github                                                                       |
| Repository   | this repository                                                              |
| Branch       | `master`                                                                     |
| Build Path   | `/` — leave it alone, see below                                              |
| Trigger Type | On Push                                                                      |
| Watch Paths  | optional: `apps/server/**`, `packages/shared/**`, `package.json`, `bun.lock` |

**Build Type** panel:

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| Build Type          | Dockerfile                               |
| Docker File         | `apps/server/Dockerfile`                 |
| Docker Context Path | empty — the default `.` is the repo root |
| Docker Build Stage  | empty — the image is single-stage        |

Neither Build Path nor Docker Context Path may be narrowed to `apps/server`.
Both Dockerfiles copy `package.json`, `bun.lock` and `packages/shared` from the
repo root, so a narrower context fails on the first `COPY`.

**Domain**: `api.example.com` → container port **3001**, HTTPS + Let's Encrypt.

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

A second **Application** from the same repository. The Provider panel is filled
in exactly as in step 3 — same repo, branch `master`, Build Path `/` — with the
watch paths, if you set any, pointing at `apps/web/**` instead of
`apps/server/**`.

**Build Type** panel:

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| Build Type          | Dockerfile                                 |
| Docker File         | `apps/web/Dockerfile`                      |
| Docker Context Path | empty — the default `.` is the repo root   |
| Docker Build Stage  | empty — `runner` is already the last stage |

**Domain**: `play.example.com` → container port **3000**, HTTPS + Let's Encrypt.

**Build-time value.** In the **Environment** tab, scroll past the environment
variables to the separate **Build-Time Arguments** box and put it there:

```
NEXT_PUBLIC_SERVER_URL=https://api.example.com
```

This is the single easiest thing to get wrong, so it is worth being blunt about:
Dokploy passes **only** Build-Time Arguments to a Dockerfile build. The same
name typed into the environment variables above it reaches the container at run
time — long after `next build` has inlined `NEXT_PUBLIC_*` values into the
JavaScript — and the build stops with `NEXT_PUBLIC_SERVER_URL is empty`.

Changing the value later means a rebuild, not a restart. The build refusing to
proceed is deliberate: the alternative was a bundle silently pointing at
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
