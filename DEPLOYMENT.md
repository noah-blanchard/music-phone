# Deploying MusicPhone

Two pieces, deployed separately: the **web app** on Vercel and the **game server**
(plus its Redis/Key Value store) on Render. Deploy the server first — the web
build needs its URL.

## 1. Server (Render)

`render.yaml` is a blueprint: point Render at the repo and it creates both the
web service and the `musicphone-store` Key Value instance. The service builds
from `Dockerfile`, because Render's Node runtime does not ship the Bun binary
this server runs on.

| Variable     | Set by    | Value                                                                          |
| ------------ | --------- | ------------------------------------------------------------------------------ |
| `WEB_ORIGIN` | you       | The exact Vercel URL, no trailing slash — e.g. `https://musicphone.vercel.app` |
| `REDIS_URL`  | blueprint | Wired from `musicphone-store`                                                  |
| `PORT`       | Render    | Injected automatically                                                         |

`WEB_ORIGIN` is the only manual one, and leaving it unset is not harmless: the
server falls back to allowing **any** origin and logs a warning at startup. It
is also what the WebSocket upgrade is checked against — CORS does not cover
upgrades, so this is the only thing standing between the game and a socket
opened from someone else's page.

If Render rejects the blueprint on `type: keyvalue`, the account is on the older
schema: rename that service block and the `fromService` reference to `redis`.

Check after deploying:

- `GET /health` returns `{"ok":true,...}` (Render polls this as the health check).
- The startup log line reads `storage: redis`, not `storage: memory`. `memory`
  means `REDIS_URL` did not arrive, and every game will die with the next deploy.
- Neither of the two startup warnings (`WEB_ORIGIN is unset`, `REDIS_URL is
unset`) appears.

**Free plan caveat.** A free Render service spins down when idle and takes a few
seconds to wake. Rooms survive it — they are in Redis, and round deadlines are
absolute timestamps that are re-armed on boot — but the first request after a
spin-down is slow. Any paid instance type removes this.

## 2. Web (Vercel)

Import the repo with **root directory `apps/web`**. Vercel detects Next.js; no
build command override is needed.

| Variable                 | Value                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SERVER_URL` | The Render service URL, e.g. `https://musicphone-server.onrender.com` |

`NEXT_PUBLIC_*` values are inlined at build time, so this must be set **before**
the build, and a change to it requires a redeploy, not just a restart. A
production build without it fails deliberately — the alternative was a bundle
that silently pointed at `localhost:3001`, which works for whoever built it and
for nobody else.

The client derives the WebSocket URL from the same value, so `https://` becomes
`wss://` on its own. Do not set a separate socket variable.

## 3. Smoke test the live pair

1. Open the site in two browsers, create a room in one, join with the link in the other.
2. Start the game; both should see the wheel, then the countdown, then the editor.
3. Place notes in both, press play, submit. The round should advance when both are ready.
4. Let one round run out on the timer instead of submitting — it should advance anyway.
5. Reach the results screen and complete the reveal to the end.
6. Close the presenter's tab mid-reveal: the host must still be able to finish.
7. Kill the wifi on one client for ~5s: it should reconnect with its notes and its
   sound intact, and without replaying the round intro.
8. Redeploy the server mid-game: clients back off and reconnect, and the game
   resumes with its round timer where it was.

## Operating notes

- **Logs.** The server logs on stdout, so Render's log stream is the whole story.
  Room lifecycle, refused origins and rate-limit rejections all appear there.
- **Rooms expire on their own.** Every room carries a four-hour Redis TTL that is
  pushed back on each write, and an empty room is collected a minute after the
  last player leaves. Nothing needs manual cleanup.
- **Rate limits** are per IP: 5 room creations/minute, 20 joins/minute, and 40
  socket messages per burst. A player who trips one gets a 429 with an
  explanation rather than a silent failure.
- **Capacity.** One instance holds all sockets for a room. The store already
  guards writes with a version check and the bus is behind an interface, so a
  second instance is a configuration change rather than a rewrite — but until
  then, run exactly one.
