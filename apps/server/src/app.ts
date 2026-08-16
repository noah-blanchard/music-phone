import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { Redis } from "ioredis";
import type { ServerConfig } from "./config";
import { ConnectionRegistry } from "./runtime/connections";
import { LocalScheduler } from "./runtime/scheduler/local-scheduler";
import { MemoryRoomStore } from "./runtime/store/memory-store";
import { RedisRoomStore } from "./runtime/store/redis-store";
import type { RoomStore } from "./runtime/store/types";
import { RoomService } from "./runtime/room-service";
import { RateLimiter, clientKey } from "./runtime/rate-limit";
import { toCommand } from "./ws/handlers";

export interface AppParts {
  service: RoomService;
  connections: ConnectionRegistry;
  scheduler: LocalScheduler;
  /** Present only when REDIS_URL is configured; closed on shutdown. */
  redis?: Redis;
}

/**
 * Creating a room allocates state and is unauthenticated, so it is the most
 * attractive thing to hammer. A handful per minute is far more than a human
 * needs and far less than a script wants.
 */
const CREATE_LIMIT = { capacity: 5, refillPerSecond: 5 / 60 };

/** Joining is cheaper, and a group sharing one NAT will share this bucket. */
const JOIN_LIMIT = { capacity: 20, refillPerSecond: 20 / 60 };

/**
 * Per-socket message budget. Autosaves are debounced to roughly one every
 * 600ms per player, so ten a second with a burst of forty leaves ordinary play
 * far below the ceiling while capping a flood.
 */
const SOCKET_LIMIT = { capacity: 40, refillPerSecond: 10 };

/** How often idle rate-limit buckets are swept. */
const PRUNE_INTERVAL_MS = 5 * 60_000;

/**
 * Build the Elysia app.
 *
 * Split from `index.ts` so the wiring can be constructed without binding a
 * port, and so the moving parts stay reachable for shutdown.
 */
export function buildApp(config: ServerConfig) {
  const connections = new ConnectionRegistry();
  const scheduler = new LocalScheduler();

  let redis: Redis | undefined;
  let store: RoomStore;
  if (config.redisUrl) {
    redis = new Redis(config.redisUrl, {
      // Fail commands fast rather than queueing them forever if Redis is down;
      // a request that cannot be served should say so, not hang.
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redis.on("error", (error) => console.error("[redis]", error.message));
    store = new RedisRoomStore(redis);
  } else {
    store = new MemoryRoomStore();
  }

  const service = new RoomService({ store, bus: connections, scheduler });

  const createLimiter = new RateLimiter(CREATE_LIMIT);
  const joinLimiter = new RateLimiter(JOIN_LIMIT);
  const socketLimiter = new RateLimiter(SOCKET_LIMIT);

  const pruneTimer = setInterval(() => {
    createLimiter.prune();
    joinLimiter.prune();
    socketLimiter.prune();
  }, PRUNE_INTERVAL_MS);
  // Never keep the process alive just to sweep buckets.
  pruneTimer.unref?.();

  /**
   * Reject a WebSocket upgrade from an unexpected origin. CORS does not cover
   * upgrades, so without this any page on the internet could open a socket to
   * this server. Non-browser clients send no Origin at all and are left alone —
   * this is a browser-facing guard, not authentication.
   */
  const originAllowed = (origin: string | null): boolean =>
    config.allowAnyOrigin || origin === null || origin.replace(/\/+$/, "") === config.webOrigin;

  const app = new Elysia()
    .use(cors({ origin: config.webOrigin, credentials: false }))

    .get("/health", () => ({ ok: true, service: "musicphone-server" }))

    // Create a room. The caller becomes the host; returns the join code + playerId.
    .post(
      "/rooms",
      async ({ body, request, server, set }) => {
        const key = clientKey(request, server?.requestIP(request)?.address);
        if (!createLimiter.tryConsume(key)) {
          set.status = 429;
          return { error: "Too many rooms created. Wait a moment and try again." };
        }
        const { code, playerId } = await service.create(body.nickname, body.config);
        return { code, playerId };
      },
      {
        body: t.Object({
          nickname: t.String({ minLength: 1, maxLength: 20 }),
          config: t.Optional(
            t.Object({
              barsPerSong: t.Optional(t.Number()),
              contextVisibility: t.Optional(
                t.Union([t.Literal("previous"), t.Literal("all"), t.Literal("blind")]),
              ),
              selectedRoles: t.Optional(t.Array(t.String())),
              roundDurationSec: t.Optional(t.Number()),
            }),
          ),
        }),
      },
    )

    // Join an existing room by code while it is still in the lobby.
    .post(
      "/rooms/:code/join",
      async ({ params, body, request, server, set }) => {
        const key = clientKey(request, server?.requestIP(request)?.address);
        if (!joinLimiter.tryConsume(key)) {
          set.status = 429;
          return { error: "Too many join attempts. Wait a moment and try again." };
        }
        const result = await service.join(params.code.toUpperCase(), body.nickname);
        if ("error" in result) {
          set.status = 400;
          return { error: result.error };
        }
        return { code: result.code, playerId: result.playerId };
      },
      {
        params: t.Object({ code: t.String() }),
        body: t.Object({ nickname: t.String({ minLength: 1, maxLength: 20 }) }),
      },
    )

    /**
     * Realtime gameplay channel. Identity travels on the query string
     * (?code=ABCD&playerId=uuid) so a reconnect re-attaches to the same player.
     *
     * The socket's own `ws.id` is the connection id. A player may legitimately
     * hold several sockets at once — a second tab, or the overlap during a
     * reconnect — and closing one must not disturb the others.
     */
    .ws("/ws", {
      query: t.Object({ code: t.String(), playerId: t.String() }),

      async open(ws) {
        const code = ws.data.query.code.toUpperCase();
        const { playerId } = ws.data.query;

        if (!originAllowed(ws.data.request.headers.get("origin"))) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "forbidden_origin",
              message: "This origin is not allowed to connect.",
            }),
          );
          ws.close();
          return;
        }

        connections.add({
          id: ws.id,
          code,
          playerId,
          send: (message) => ws.send(JSON.stringify(message)),
        });

        const error = await service.dispatch(code, { type: "player:connected", playerId });
        if (error) {
          connections.remove(ws.id);
          ws.send(JSON.stringify({ type: "error", code: "join_failed", message: error }));
          ws.close();
        }
      },

      message(ws, raw) {
        // Over budget: drop the frame rather than closing the socket, so a
        // brief burst costs the player nothing worse than a missed edit.
        if (!socketLimiter.tryConsume(ws.id)) return;

        const command = toCommand(raw, ws.data.query.playerId);
        if (command) void service.dispatch(ws.data.query.code.toUpperCase(), command);
      },

      close(ws) {
        const code = ws.data.query.code.toUpperCase();
        const { playerId } = ws.data.query;
        connections.remove(ws.id);
        socketLimiter.forget(ws.id);

        // Only tell the room once every socket this player held has gone —
        // otherwise a reconnect would be reported as a departure.
        if (!connections.hasPlayer(code, playerId)) {
          void service.dispatch(code, { type: "player:disconnected", playerId });
        }
      },
    });

  return { app, parts: { service, connections, scheduler, redis } satisfies AppParts };
}

/** Exported for the typed Eden client in the web app. */
export type App = ReturnType<typeof buildApp>["app"];
