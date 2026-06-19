import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { MAX_PLAYERS } from "@musicphone/shared";
import { RoomManager } from "./game/room-store";
import { handleClientMessage } from "./ws/handlers";

const manager = new RoomManager();

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "*";
const PORT = Number(process.env.PORT ?? 3001);

console.log(`🚀 Starting MusicPhone server with WEB_ORIGIN=${WEB_ORIGIN} on port ${PORT}...`);

const app = new Elysia()
  .use(cors({ origin: WEB_ORIGIN, credentials: false }))
  .get("/health", () => ({ ok: true, service: "musicphone-server" }))

  // Create a room. The caller becomes the host; returns the join code + playerId.
  .post(
    "/rooms",
    ({ body }) => {
      const { room, playerId } = manager.create(body.nickname, body.config);
      return { code: room.code, playerId };
    },
    {
      body: t.Object({
        nickname: t.String({ minLength: 1, maxLength: 20 }),
        config: t.Optional(
          t.Object({
            mode: t.Optional(t.Union([t.Literal("continue"), t.Literal("layers")])),
            bpm: t.Optional(t.Number()),
            root: t.Optional(t.Number()),
            scale: t.Optional(
              t.Union([t.Literal("major"), t.Literal("minor"), t.Literal("pentatonic")]),
            ),
            barsPerSong: t.Optional(t.Number()),
            contextVisibility: t.Optional(
              t.Union([t.Literal("previous"), t.Literal("all"), t.Literal("blind")]),
            ),
            roundDurationSec: t.Optional(t.Number()),
          }),
        ),
      }),
    },
  )

  // Join an existing room by code while it is still in the lobby.
  .post(
    "/rooms/:code/join",
    ({ params, body, set }) => {
      const result = manager.join(params.code.toUpperCase(), body.nickname);
      if ("error" in result) {
        set.status = 400;
        return { error: result.error };
      }
      return { code: result.room.code, playerId: result.playerId };
    },
    {
      params: t.Object({ code: t.String() }),
      body: t.Object({ nickname: t.String({ minLength: 1, maxLength: 20 }) }),
    },
  )

  // Lightweight existence/availability probe used by the join screen.
  .get("/rooms/:code", ({ params, set }) => {
    const room = manager.get(params.code.toUpperCase());
    if (!room) {
      set.status = 404;
      return { error: "Room not found" };
    }
    return {
      code: room.code,
      phase: room.phase,
      players: room.players.length,
      max: MAX_PLAYERS,
    };
  })

  // Realtime gameplay channel. Identity is carried in the query string
  // (?code=ABCD&playerId=uuid) so reconnects re-attach to the same player.
  .ws("/ws", {
    query: t.Object({ code: t.String(), playerId: t.String() }),
    open(ws) {
      const { code, playerId } = ws.data.query;
      const ok = manager.connect(code.toUpperCase(), playerId, (msg) => ws.send(JSON.stringify(msg)));
      if (!ok) {
        ws.send(JSON.stringify({ type: "error", code: "join_failed", message: "Unknown room or player" }));
        ws.close();
        return;
      }
      manager.broadcastSnapshot(code.toUpperCase());
      manager.sync(code.toUpperCase(), playerId);
    },
    message(ws, message) {
      const { code, playerId } = ws.data.query;
      handleClientMessage(manager, code.toUpperCase(), playerId, message);
    },
    close(ws) {
      const { code, playerId } = ws.data.query;
      manager.handleClose(code.toUpperCase(), playerId);
    },
  })
  .listen(PORT);

console.log(`🎵 MusicPhone server listening on http://localhost:${PORT}`);

export type App = typeof app;
export { app };
