import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import type { ServerConfig } from "./config";
import { ConnectionRegistry } from "./runtime/connections";
import { LocalScheduler } from "./runtime/scheduler/local-scheduler";
import { MemoryRoomStore } from "./runtime/store/memory-store";
import { RoomService } from "./runtime/room-service";
import { toCommand } from "./ws/handlers";

export interface AppParts {
  service: RoomService;
  connections: ConnectionRegistry;
  scheduler: LocalScheduler;
}

/**
 * Build the Elysia app.
 *
 * Split from `index.ts` so the wiring can be constructed without binding a
 * port, and so the moving parts stay reachable for shutdown.
 */
export function buildApp(config: ServerConfig) {
  const connections = new ConnectionRegistry();
  const scheduler = new LocalScheduler();
  const service = new RoomService({
    store: new MemoryRoomStore(),
    bus: connections,
    scheduler,
  });

  const app = new Elysia()
    .use(cors({ origin: config.webOrigin, credentials: false }))

    .get("/health", () => ({ ok: true, service: "musicphone-server" }))

    // Create a room. The caller becomes the host; returns the join code + playerId.
    .post(
      "/rooms",
      async ({ body }) => {
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
      async ({ params, body, set }) => {
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
        const command = toCommand(raw, ws.data.query.playerId);
        if (command) void service.dispatch(ws.data.query.code.toUpperCase(), command);
      },

      close(ws) {
        const code = ws.data.query.code.toUpperCase();
        const { playerId } = ws.data.query;
        connections.remove(ws.id);

        // Only tell the room once every socket this player held has gone —
        // otherwise a reconnect would be reported as a departure.
        if (!connections.hasPlayer(code, playerId)) {
          void service.dispatch(code, { type: "player:disconnected", playerId });
        }
      },
    });

  return { app, parts: { service, connections, scheduler } satisfies AppParts };
}

/** Exported for the typed Eden client in the web app. */
export type App = ReturnType<typeof buildApp>["app"];
