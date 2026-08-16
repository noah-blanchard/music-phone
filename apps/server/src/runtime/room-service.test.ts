import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRole, type Room, type ServerMessage, type ServerMessageType } from "@musicphone/shared";
import { EMPTY_ROOM_TTL_MS, LEAVE_GRACE_MS, type ReducerContext } from "../game/reducer";
import { ConnectionRegistry } from "./connections";
import { LocalScheduler } from "./scheduler/local-scheduler";
import { MemoryRoomStore } from "./store/memory-store";
import { RoomService } from "./room-service";

/**
 * Integration tests: the real store, registry, scheduler and reducer wired
 * together, driven through the same entry points the WebSocket gateway uses.
 * Only the clock is faked.
 */

let store: MemoryRoomStore;
let connections: ConnectionRegistry;
let scheduler: LocalScheduler;
let service: RoomService;

function seededRandom(seed = 99): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);

  const random = seededRandom();
  let n = 0;
  const context = (): ReducerContext => ({
    now: Date.now(),
    random,
    uuid: () => `id-${++n}`,
  });

  store = new MemoryRoomStore();
  connections = new ConnectionRegistry();
  scheduler = new LocalScheduler();
  service = new RoomService({ store, bus: connections, scheduler, context });
});

afterEach(() => {
  scheduler.cancelAll();
  vi.useRealTimers();
});

/** A stand-in for one open WebSocket. */
class Socket {
  readonly received: ServerMessage[] = [];

  constructor(
    readonly id: string,
    readonly code: string,
    readonly playerId: string,
  ) {
    connections.add({ id, code, playerId, send: (m) => this.received.push(m) });
  }

  /** Every message of a given type this socket has seen. */
  ofType<T extends ServerMessageType>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  get last(): ServerMessage | undefined {
    return this.received.at(-1);
  }

  clear(): void {
    this.received.length = 0;
  }

  close(): void {
    connections.remove(this.id);
  }
}

/** Open a socket and announce the connection, as the gateway does. */
async function connect(
  code: string,
  playerId: string,
  socketId = `s-${playerId}`,
): Promise<Socket> {
  const socket = new Socket(socketId, code, playerId);
  await service.dispatch(code, { type: "player:connected", playerId });
  return socket;
}

/** Close a socket and announce the disconnect only if it was the player's last. */
async function disconnect(socket: Socket): Promise<void> {
  socket.close();
  if (!connections.hasPlayer(socket.code, socket.playerId)) {
    await service.dispatch(socket.code, {
      type: "player:disconnected",
      playerId: socket.playerId,
    });
  }
}

/** A room with `count` players, each holding one live socket. */
async function lobby(count: number): Promise<{ code: string; sockets: Socket[] }> {
  const { code, playerId } = await service.create("Host");
  const sockets = [await connect(code, playerId)];

  for (let i = 1; i < count; i++) {
    const joined = await service.join(code, `Player ${i}`);
    if ("error" in joined) throw new Error(joined.error);
    sockets.push(await connect(code, joined.playerId));
  }
  return { code, sockets };
}

async function startedGame(count: number): Promise<{ code: string; sockets: Socket[] }> {
  const room = await lobby(count);
  const error = await service.dispatch(room.code, {
    type: "game:start",
    playerId: room.sockets[0]!.playerId,
  });
  expect(error).toBeUndefined();
  return room;
}

/* ------------------------------ lobby basics ------------------------------ */

describe("creating and joining", () => {
  it("creates a room the host can then be found in", async () => {
    const { code, playerId } = await service.create("Noah");
    const room = await service.get(code);
    expect(room?.players).toHaveLength(1);
    expect(room?.hostId).toBe(playerId);
  });

  it("allocates distinct codes", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) codes.add((await service.create("Host")).code);
    expect(codes.size).toBe(25);
  });

  it("reports a join to a room that does not exist", async () => {
    await expect(service.join("NOPE", "Guest")).resolves.toEqual({ error: "Room not found" });
  });

  it("tells everyone already in the room when someone joins", async () => {
    const { code, sockets } = await lobby(1);
    sockets[0]!.clear();

    await service.join(code, "Guest");

    const snapshots = sockets[0]!.ofType("room:snapshot");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.room.players).toHaveLength(2);
  });

  it("gives each player a snapshot addressed to them", async () => {
    const { sockets } = await lobby(2);
    for (const socket of sockets) {
      const snapshot = socket.ofType("room:snapshot").at(-1)!;
      expect(snapshot.room.selfId).toBe(socket.playerId);
    }
  });

  it("withholds the songs until the game is over", async () => {
    const { sockets } = await startedGame(2);
    for (const socket of sockets) {
      for (const snapshot of socket.ofType("room:snapshot")) {
        expect(snapshot.room.melodies).toEqual([]);
      }
    }
  });

  it("refuses a connection from an unknown player", async () => {
    const { code } = await lobby(1);
    const error = await service.dispatch(code, { type: "player:connected", playerId: "ghost" });
    expect(error).toBe("Unknown room or player");
  });

  it("refuses a command for a room that does not exist", async () => {
    await expect(
      service.dispatch("NOPE", { type: "player:ready", playerId: "x", ready: true }),
    ).resolves.toBe("Room not found");
  });
});

/* ------------------------ the reconnect race (C1) ------------------------- */

describe("a player holding two sockets", () => {
  it("keeps serving the newer socket when the older one closes", async () => {
    const { code, sockets } = await lobby(2);
    const [host, guest] = sockets;

    // The guest reconnects: the new socket lands before the old one's close.
    const reconnected = new Socket("s-guest-2", code, guest!.playerId);
    await service.dispatch(code, { type: "player:connected", playerId: guest!.playerId });

    await disconnect(guest!);
    reconnected.clear();

    // A later change must still reach them.
    await service.join(code, "Someone else");
    expect(reconnected.ofType("room:snapshot")).toHaveLength(1);

    // ...and they must still be in the room, marked connected.
    const room = await service.get(code);
    const player = room!.players.find((p) => p.id === guest!.playerId);
    expect(player?.connected).toBe(true);
    expect(host!.received.length).toBeGreaterThan(0);
  });

  it("does not evict the player from the lobby after the grace window", async () => {
    const { code, sockets } = await lobby(2);
    const guest = sockets[1]!;

    new Socket("s-guest-2", code, guest.playerId);
    await service.dispatch(code, { type: "player:connected", playerId: guest.playerId });
    await disconnect(guest);

    // The old socket's close must not have armed a removal for a player who is
    // still holding a live socket.
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS * 2);

    const room = await service.get(code);
    expect(room!.players.map((p) => p.id)).toContain(guest.playerId);
  });

  it("only reports a disconnect once the last socket has gone", async () => {
    const { code, sockets } = await lobby(2);
    const guest = sockets[1]!;
    const second = new Socket("s-guest-2", code, guest.playerId);

    await disconnect(guest);
    expect((await service.get(code))!.players[1]!.connected).toBe(true);

    await disconnect(second);
    expect((await service.get(code))!.players[1]!.connected).toBe(false);
  });
});

/* --------------------------- leaving and reaping -------------------------- */

describe("leaving the lobby", () => {
  it("removes a player once the grace window passes", async () => {
    const { code, sockets } = await lobby(2);
    await disconnect(sockets[1]!);

    expect((await service.get(code))!.players).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS);
    expect((await service.get(code))!.players).toHaveLength(1);
  });

  it("keeps the player if they reconnect inside the window", async () => {
    const { code, sockets } = await lobby(2);
    const guest = sockets[1]!;

    await disconnect(guest);
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS / 2);
    await connect(code, guest.playerId, "s-guest-again");
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS);

    const room = await service.get(code);
    expect(room!.players).toHaveLength(2);
    expect(room!.players[1]!.connected).toBe(true);
  });

  it("hands the host role on when the host leaves", async () => {
    const { code, sockets } = await lobby(3);
    await disconnect(sockets[0]!);
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS);

    const room = await service.get(code);
    expect(room!.hostId).toBe(sockets[1]!.playerId);
  });

  it("keeps the slot mid-game rather than breaking the rotation", async () => {
    const { code, sockets } = await startedGame(3);
    await disconnect(sockets[1]!);
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS * 4);

    const room = await service.get(code);
    expect(room!.players).toHaveLength(3);
    expect(room!.totalRounds).toBe(3);
  });
});

describe("reaping an empty room", () => {
  it("deletes the room once everyone has been gone long enough", async () => {
    const { code, sockets } = await lobby(1);
    await disconnect(sockets[0]!);

    // The grace window empties the lobby, which re-arms the reaper from that
    // moment — so the room outlives the disconnect by grace + TTL, not TTL.
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS);
    expect(await service.get(code)).toBeDefined();

    await vi.advanceTimersByTimeAsync(EMPTY_ROOM_TTL_MS - 1);
    expect(await service.get(code)).toBeDefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(await service.get(code)).toBeUndefined();
  });

  it("spares a room somebody came back to", async () => {
    const { code, sockets } = await lobby(1);
    await disconnect(sockets[0]!);

    // Back inside the grace window, so the slot is still theirs.
    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS / 2);
    await connect(code, sockets[0]!.playerId, "s-back");

    await vi.advanceTimersByTimeAsync(LEAVE_GRACE_MS + EMPTY_ROOM_TTL_MS);
    expect(await service.get(code)).toBeDefined();
  });

  it("collects a room that was created but never joined", async () => {
    // POST /rooms is unauthenticated, so a script could once loop it and grow
    // the store without bound: the reaper was only armed when someone left, and
    // nobody had ever arrived.
    const { code } = await service.create("Ghost");
    expect(await service.get(code)).toBeDefined();

    await vi.advanceTimersByTimeAsync(EMPTY_ROOM_TTL_MS);
    expect(await service.get(code)).toBeUndefined();
  });

  it("spares a created room the host actually connects to", async () => {
    const { code, playerId } = await service.create("Host");
    await connect(code, playerId);

    await vi.advanceTimersByTimeAsync(EMPTY_ROOM_TTL_MS * 2);
    expect(await service.get(code)).toBeDefined();
  });

  it("keeps a finished game around for the reveal until everyone has gone", async () => {
    const { code, sockets } = await startedGame(2);
    for (let round = 0; round < 2; round++) {
      for (const socket of sockets) {
        await service.dispatch(code, { type: "turn:submit", playerId: socket.playerId, notes: [] });
      }
    }

    await vi.advanceTimersByTimeAsync(EMPTY_ROOM_TTL_MS * 2);
    expect((await service.get(code))?.phase).toBe("results");
  });
});

/* --------------------------------- playing -------------------------------- */

describe("starting a game", () => {
  it("refuses anyone but the host, and says why", async () => {
    const { code, sockets } = await lobby(2);
    await expect(
      service.dispatch(code, { type: "game:start", playerId: sockets[1]!.playerId }),
    ).resolves.toBe("Only the host can start the game");
  });

  it("gives every player their own opening round", async () => {
    const { sockets } = await startedGame(3);
    for (const socket of sockets) {
      const started = socket.ofType("round:started");
      expect(started).toHaveLength(1);
      expect(started[0]!.round).toBe(0);
      expect(started[0]!.isFirstLayer).toBe(true);
      expect(started[0]!.role).toBeDefined();
    }
  });

  it("deals each player a different kit", async () => {
    const { sockets } = await startedGame(3);
    const roles = sockets.map((s) => s.ofType("round:started")[0]!.role.id);
    expect(new Set(roles).size).toBe(3);
  });
});

describe("finishing a round", () => {
  it("advances as soon as the last player submits", async () => {
    const { code, sockets } = await startedGame(2);
    for (const socket of sockets) socket.clear();

    await service.dispatch(code, {
      type: "turn:submit",
      playerId: sockets[0]!.playerId,
      notes: [],
    });
    expect(sockets[0]!.ofType("round:ended")).toHaveLength(0);

    await service.dispatch(code, {
      type: "turn:submit",
      playerId: sockets[1]!.playerId,
      notes: [],
    });

    expect(sockets[0]!.ofType("round:ended")).toHaveLength(1);
    expect(sockets[0]!.ofType("round:started")).toHaveLength(1); // the next round
    expect((await service.get(code))!.round).toBe(1);
  });

  it("advances on its own when the clock runs out", async () => {
    const { code } = await startedGame(2);
    const room = await service.get(code);

    await vi.advanceTimersByTimeAsync(room!.config.roundDurationSec * 1000);
    expect((await service.get(code))!.round).toBe(1);
  });

  it("does not let a timer from an early-ended round cut the next one short", async () => {
    const { code, sockets } = await startedGame(2);
    const room = await service.get(code);
    const duration = room!.config.roundDurationSec * 1000;

    // End round 0 early, halfway through its clock.
    await vi.advanceTimersByTimeAsync(duration / 2);
    for (const socket of sockets) {
      await service.dispatch(code, { type: "turn:submit", playerId: socket.playerId, notes: [] });
    }
    expect((await service.get(code))!.round).toBe(1);

    // Round 0's original deadline passes: round 1 must be untouched.
    await vi.advanceTimersByTimeAsync(duration / 2);
    expect((await service.get(code))!.round).toBe(1);

    // Round 1's own deadline still ends it.
    await vi.advanceTimersByTimeAsync(duration / 2);
    expect((await service.get(code))!.phase).toBe("results");
  });

  it("plays a whole game through to the reveal", async () => {
    const { code, sockets } = await startedGame(3);

    for (let round = 0; round < 3; round++) {
      for (const socket of sockets) {
        await service.dispatch(code, {
          type: "turn:submit",
          playerId: socket.playerId,
          notes: [],
        });
      }
    }

    const room = await service.get(code);
    expect(room!.phase).toBe("results");
    for (const melody of room!.melodies) expect(melody.segments).toHaveLength(3);

    for (const socket of sockets) {
      const finished = socket.ofType("game:finished");
      expect(finished).toHaveLength(1);
      expect(finished[0]!.melodies).toHaveLength(3);
    }
  });
});

describe("catching up after a reconnect", () => {
  it("replays the current round to a player who comes back mid-game", async () => {
    const { code, sockets } = await startedGame(2);
    const player = sockets[1]!;

    await disconnect(player);
    const back = await connect(code, player.playerId, "s-back");

    const started = back.ofType("round:started");
    expect(started).toHaveLength(1);
    expect(started[0]!.round).toBe(0);
  });

  it("hands the finished songs to a player who comes back during results", async () => {
    const { code, sockets } = await startedGame(2);
    for (let round = 0; round < 2; round++) {
      for (const socket of sockets) {
        await service.dispatch(code, { type: "turn:submit", playerId: socket.playerId, notes: [] });
      }
    }

    const player = sockets[1]!;
    await disconnect(player);
    const back = await connect(code, player.playerId, "s-back");

    expect(back.ofType("game:finished")).toHaveLength(1);
    expect(back.ofType("room:snapshot").at(-1)!.room.melodies).toHaveLength(2);
  });
});

/* --------------------------------- reveal --------------------------------- */

/**
 * Whoever the reveal rule currently puts in charge: the active song's author if
 * they are here, else the host, else anyone still connected.
 */
function whoDrives(room: Room, sockets: Socket[]): string {
  const here = (id: string | undefined) =>
    id !== undefined && room.players.some((p) => p.id === id && p.connected);

  const presenter = room.melodies[room.reveal.activeSong]?.seedPlayerId;
  if (here(presenter)) return presenter!;
  if (here(room.hostId)) return room.hostId;

  const anyone = sockets.find((s) => room.players.some((p) => p.id === s.playerId && p.connected));
  if (!anyone) throw new Error("nobody left who could drive the reveal");
  return anyone.playerId;
}

describe("the results reveal", () => {
  it("keeps going when the presenting player disappears", async () => {
    const { code, sockets } = await startedGame(3);
    for (let round = 0; round < 3; round++) {
      for (const socket of sockets) {
        await service.dispatch(code, { type: "turn:submit", playerId: socket.playerId, notes: [] });
      }
    }

    const room = await service.get(code);
    const presenterId = room!.melodies[0]!.seedPlayerId;
    const presenter = sockets.find((s) => s.playerId === presenterId)!;
    const others = sockets.filter((s) => s.playerId !== presenterId);

    // The author of song 1 closes their tab mid-presentation.
    await disconnect(presenter);

    // Someone else must still be able to reveal and advance. Before the
    // fallback existed this froze the results screen for everyone, forever.
    const driver = others[0]!;
    await service.dispatch(code, {
      type: "reveal:update",
      playerId: driver.playerId,
      activeSong: 0,
      revealedLayers: 2,
      playing: true,
    });
    expect((await service.get(code))!.reveal.revealedLayers).toBe(2);

    // ...and the reveal can still be driven all the way to the end. Control
    // returns to each song's own author as it comes up, so the driver changes.
    for (let song = 0; song < 3; song++) {
      const current = (await service.get(code))!;
      const inCharge = whoDrives(current, sockets);
      await service.dispatch(code, {
        type: "reveal:update",
        playerId: inCharge,
        activeSong: current.reveal.activeSong + 1,
        revealedLayers: 0,
        playing: false,
      });
    }
    expect((await service.get(code))!.reveal.done).toBe(true);
  });

  it("tells each player whether they may drive", async () => {
    const { code, sockets } = await startedGame(2);
    for (let round = 0; round < 2; round++) {
      for (const socket of sockets) {
        await service.dispatch(code, { type: "turn:submit", playerId: socket.playerId, notes: [] });
      }
    }

    const room = await service.get(code);
    const presenterId = room!.melodies[0]!.seedPlayerId;
    const hostId = room!.hostId;

    for (const socket of sockets) {
      const snapshot = socket.ofType("room:snapshot").at(-1)!;
      const shouldControl = socket.playerId === presenterId || socket.playerId === hostId;
      expect(snapshot.room.canControlReveal).toBe(shouldControl);
    }
  });

  it("never says a lobby player may drive a reveal", async () => {
    const { sockets } = await lobby(2);
    for (const socket of sockets) {
      expect(socket.ofType("room:snapshot").at(-1)!.room.canControlReveal).toBe(false);
    }
  });
});

/* -------------------------------- ordering -------------------------------- */

describe("concurrent commands", () => {
  it("applies a burst on one room without losing any of it", async () => {
    const { code, sockets } = await startedGame(3);

    // Fire without awaiting: the service must serialise these itself.
    await Promise.all(
      sockets.map((socket) =>
        service.dispatch(code, { type: "player:ready", playerId: socket.playerId, ready: true }),
      ),
    );

    // Every ready landed, so the round advanced exactly once.
    expect((await service.get(code))!.round).toBe(1);
  });

  it("keeps a burst of autosaves from clobbering one another", async () => {
    const { code, sockets } = await startedGame(2);
    const player = sockets[0]!.playerId;
    const room = await service.get(code);
    // Cycle through the sounds this player's dealt kit actually offers.
    const sounds = getRole(room!.assignments[player])!.instruments;

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        service.dispatch(code, {
          type: "turn:autosave",
          playerId: player,
          notes: [],
          instrumentId: sounds[i % sounds.length],
        }),
      ),
    );

    // Commands are serialised, so the last one queued is the one that stuck.
    const expected = sounds[19 % sounds.length];
    expect((await service.get(code))!.turns[player]!.instrumentId).toBe(expected);
  });
});
