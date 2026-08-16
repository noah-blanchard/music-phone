import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  MAX_PLAYERS,
  MIN_PLAYERS,
  getRole,
  type Note,
  type Room,
} from "@musicphone/shared";
import { cleanName, createRoom, joinRoom, randomCode } from "./create";
import {
  EMPTY_ROOM_TTL_MS,
  LEAVE_GRACE_MS,
  reduce,
  type ReducerContext,
  type ReduceResult,
} from "./reducer";
import { REAP_TIMER, ROUND_TIMER, graceTimer, type Effect } from "./effects";
import type { Command } from "./commands";

/* --------------------------------- harness -------------------------------- */

const NOW = 1_700_000_000_000;

/** Deterministic LCG so wheel offsets and slot rolls are reproducible. */
function seededRandom(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeCtx(overrides: Partial<ReducerContext> = {}): ReducerContext {
  let n = 0;
  return {
    now: NOW,
    random: seededRandom(42),
    uuid: () => `id-${++n}`,
    ...overrides,
  };
}

let ctx: ReducerContext;
beforeEach(() => {
  ctx = makeCtx();
});

/** A lobby room with `count` players, all connected. */
function lobbyOf(count: number, config = {}): Room {
  let { room } = createRoom("ABCD", "Host", config, ctx);
  for (let i = 1; i < count; i++) {
    const result = joinRoom(room, `Player ${i}`, ctx);
    if ("error" in result) throw new Error(result.error);
    room = result.room;
  }
  for (const player of room.players) {
    room = reduce(room, { type: "player:connected", playerId: player.id }, ctx).room;
  }
  return room;
}

/** A room mid-game at round 0, with every player connected. */
function startedGame(count: number, config = {}): Room {
  const lobby = lobbyOf(count, config);
  const result = reduce(lobby, { type: "game:start", playerId: lobby.hostId }, ctx);
  expect(result.error).toBeUndefined();
  return result.room;
}

/** Apply a sequence of commands, threading the room through. */
function applyAll(room: Room, commands: Command[]): Room {
  return commands.reduce((acc, command) => reduce(acc, command, ctx).room, room);
}

/**
 * A note the given player is actually allowed to place. The wheel deals kits at
 * random, and a drum kit reads `pitch` as a lane index rather than a MIDI note,
 * so a fixed note would be silently rejected for whoever drew the drums.
 * `start` distinguishes notes belonging to different players.
 */
function noteFor(room: Room, playerId: string, start: number): Note {
  const isDrums = getRole(room.assignments[playerId])?.editor === "drum-grid";
  return isDrums ? { pitch: 0, start, length: 1 } : { pitch: 60, start, length: 1 };
}

const effectTypes = (result: ReduceResult) => result.effects.map((e) => e.type);

function findEffect<T extends Effect["type"]>(
  result: ReduceResult,
  type: T,
): Extract<Effect, { type: T }> | undefined {
  return result.effects.find((e): e is Extract<Effect, { type: T }> => e.type === type);
}

/* ------------------------------ create / join ----------------------------- */

describe("cleanName", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanName("  Noah  ")).toBe("Noah");
  });

  it("truncates to 20 characters", () => {
    expect(cleanName("x".repeat(50))).toHaveLength(20);
  });

  it.each(["", "   ", "\t\n"])("falls back to 'Player' for %j", (input) => {
    expect(cleanName(input)).toBe("Player");
  });
});

describe("randomCode", () => {
  it("avoids characters that are easy to misread aloud", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      expect(randomCode(random)).not.toMatch(/[01OI]/);
    }
  });

  it("produces the requested length", () => {
    expect(randomCode(seededRandom(1), 6)).toHaveLength(6);
  });
});

describe("createRoom", () => {
  it("opens in the lobby with the creator as an unconnected host", () => {
    const { room, playerId } = createRoom("ABCD", "Noah", undefined, ctx);
    expect(room.phase).toBe("lobby");
    expect(room.code).toBe("ABCD");
    expect(room.hostId).toBe(playerId);
    expect(room.players).toEqual([{ id: playerId, name: "Noah", connected: false, isHost: true }]);
    expect(room.melodies).toEqual([]);
    expect(room.turns).toEqual({});
  });

  it("sanitises the requested config rather than trusting it", () => {
    const { room } = createRoom("ABCD", "Noah", { barsPerSong: 999, roundDurationSec: 1 }, ctx);
    expect(room.config.barsPerSong).toBe(8);
    expect(room.config.roundDurationSec).toBe(30);
  });

  it("defaults the config when none is given", () => {
    expect(createRoom("ABCD", "Noah", undefined, ctx).room.config).toEqual(DEFAULT_CONFIG);
  });
});

describe("joinRoom", () => {
  it("adds a non-host player and leaves the input room untouched", () => {
    const { room } = createRoom("ABCD", "Host", undefined, ctx);
    const before = structuredClone(room);

    const result = joinRoom(room, "Guest", ctx);
    if ("error" in result) throw new Error(result.error);

    expect(result.room.players).toHaveLength(2);
    expect(result.room.players[1]).toMatchObject({ name: "Guest", isHost: false });
    expect(room).toEqual(before);
  });

  it("refuses once the game has started", () => {
    expect(joinRoom(startedGame(2), "Late", ctx)).toEqual({ error: "Game already started" });
  });

  it("refuses when the room is full", () => {
    expect(joinRoom(lobbyOf(MAX_PLAYERS), "One too many", ctx)).toEqual({ error: "Room is full" });
  });
});

/* ------------------------------- purity ---------------------------------- */

describe("reduce", () => {
  it("never mutates the room it is given", () => {
    const room = startedGame(3);
    const before = structuredClone(room);
    const player = room.players[0]!;

    reduce(
      room,
      { type: "turn:submit", playerId: player.id, notes: [], instrumentId: "lead" },
      ctx,
    );
    reduce(room, { type: "player:disconnected", playerId: player.id }, ctx);
    reduce(room, { type: "player:ready", playerId: player.id, ready: true }, ctx);

    expect(room).toEqual(before);
  });

  it("returns the original room object unchanged when a command is refused", () => {
    const room = lobbyOf(2);
    const result = reduce(room, { type: "game:start", playerId: "not-the-host" }, ctx);
    expect(result.room).toBe(room);
    expect(result.error).toBe("Only the host can start the game");
  });
});

/* ----------------------------- connection ---------------------------------- */

describe("player:connected", () => {
  it("marks the player live and calls off both collection timers", () => {
    const { room } = createRoom("ABCD", "Host", undefined, ctx);
    const host = room.players[0]!;
    const result = reduce(room, { type: "player:connected", playerId: host.id }, ctx);

    expect(result.room.players[0]!.connected).toBe(true);
    expect(result.effects).toContainEqual({ type: "cancel", key: REAP_TIMER });
    expect(result.effects).toContainEqual({ type: "cancel", key: graceTimer(host.id) });
    expect(effectTypes(result)).toContain("snapshot");
  });

  it("refuses an unknown player", () => {
    const room = lobbyOf(2);
    const result = reduce(room, { type: "player:connected", playerId: "ghost" }, ctx);
    expect(result.error).toBe("Unknown room or player");
    expect(result.effects).toEqual([]);
  });

  it("replays the current round to someone reconnecting mid-game", () => {
    const room = startedGame(3);
    const player = room.players[1]!;
    const result = reduce(room, { type: "player:connected", playerId: player.id }, ctx);
    expect(result.effects).toContainEqual({ type: "announce-round-to", playerId: player.id });
  });

  it("hands the finished songs to someone reconnecting during results", () => {
    const room = finishGame(2);
    const player = room.players[0]!;
    const result = reduce(room, { type: "player:connected", playerId: player.id }, ctx);
    const send = findEffect(result, "send");
    expect(send?.message.type).toBe("game:finished");
  });
});

describe("player:disconnected", () => {
  it("marks the player offline and tells everyone still there", () => {
    const room = lobbyOf(3);
    const result = reduce(
      room,
      { type: "player:disconnected", playerId: room.players[1]!.id },
      ctx,
    );
    expect(result.room.players[1]!.connected).toBe(false);
    expect(effectTypes(result)).toContain("snapshot");
  });

  it("starts a grace window in the lobby so a quick reconnect keeps the slot", () => {
    const room = lobbyOf(3);
    const player = room.players[1]!;
    const result = reduce(room, { type: "player:disconnected", playerId: player.id }, ctx);

    expect(findEffect(result, "schedule")).toEqual({
      type: "schedule",
      key: graceTimer(player.id),
      at: NOW + LEAVE_GRACE_MS,
      command: { type: "player:grace-expired", playerId: player.id },
    });
  });

  it("never starts a grace window mid-game — the slot must survive to the end", () => {
    const room = startedGame(3);
    const player = room.players[1]!;
    const result = reduce(room, { type: "player:disconnected", playerId: player.id }, ctx);

    const scheduled = result.effects.filter((e) => e.type === "schedule");
    expect(scheduled.map((e) => e.key)).not.toContain(graceTimer(player.id));
    expect(result.room.players[1]!.connected).toBe(false);
    expect(result.room.players).toHaveLength(3);
  });

  it("schedules collection, not a snapshot, once the last player drops", () => {
    const room = lobbyOf(1);
    const result = reduce(
      room,
      { type: "player:disconnected", playerId: room.players[0]!.id },
      ctx,
    );

    expect(effectTypes(result)).not.toContain("snapshot");
    expect(result.effects).toContainEqual({
      type: "schedule",
      key: REAP_TIMER,
      at: NOW + EMPTY_ROOM_TTL_MS,
      command: { type: "room:reap" },
    });
  });

  it("ignores an unknown player", () => {
    const room = lobbyOf(2);
    expect(reduce(room, { type: "player:disconnected", playerId: "ghost" }, ctx).effects).toEqual(
      [],
    );
  });
});

describe.each(["player:left", "player:grace-expired"] as const)("%s", (type) => {
  it("removes the player from a lobby", () => {
    const room = lobbyOf(3);
    const leaving = room.players[1]!;
    const result = reduce(room, { type, playerId: leaving.id }, ctx);

    expect(result.room.players.map((p) => p.id)).not.toContain(leaving.id);
    expect(result.room.players).toHaveLength(2);
  });

  it("hands the host role to the next player when the host leaves the lobby", () => {
    const room = lobbyOf(3);
    const oldHost = room.hostId;
    const result = reduce(room, { type, playerId: oldHost }, ctx);

    expect(result.room.hostId).not.toBe(oldHost);
    expect(result.room.hostId).toBe(result.room.players[0]!.id);
    expect(result.room.players[0]!.isHost).toBe(true);
  });

  it("keeps the slot mid-game and only marks the player offline", () => {
    const room = startedGame(3);
    const leaving = room.players[1]!;
    const result = reduce(room, { type, playerId: leaving.id }, ctx);

    expect(result.room.players).toHaveLength(3);
    expect(result.room.players[1]!.connected).toBe(false);
  });

  it("always cancels the grace timer it may have been fired by", () => {
    const room = lobbyOf(2);
    const leaving = room.players[1]!;
    const result = reduce(room, { type, playerId: leaving.id }, ctx);
    expect(result.effects).toContainEqual({ type: "cancel", key: graceTimer(leaving.id) });
  });
});

/* ------------------------------- game start ------------------------------- */

describe("game:start", () => {
  it.each([
    ["a non-host", 2, {}, "not-host", "Only the host can start the game"],
    ["too few players", 1, {}, null, `Need at least ${MIN_PLAYERS} players`],
  ])("refuses %s", (_label, count, config, actor, message) => {
    const room = lobbyOf(count, config);
    const result = reduce(room, { type: "game:start", playerId: actor ?? room.hostId }, ctx);
    expect(result.error).toBe(message);
    expect(result.room.phase).toBe("lobby");
  });

  it("refuses when fewer kits are selected than there are players", () => {
    const room = lobbyOf(3, { selectedRoles: ["drums", "bass"] });
    const result = reduce(room, { type: "game:start", playerId: room.hostId }, ctx);
    expect(result.error).toBe("Select at least 3 layer kinds (one per player)");
  });

  it("refuses to start twice", () => {
    const room = startedGame(2);
    expect(reduce(room, { type: "game:start", playerId: room.hostId }, ctx).error).toBe(
      "Game already started",
    );
  });

  it("runs one round per player", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const room = startedGame(n);
      expect(room.totalRounds).toBe(n);
      expect(room.melodies).toHaveLength(n);
    }
  });

  it("seeds one song per player, each with its own tempo and key", () => {
    const room = startedGame(4);
    expect(room.melodies.map((m) => m.seedPlayerId).sort()).toEqual(
      room.players.map((p) => p.id).sort(),
    );
    for (const melody of room.melodies) {
      expect(melody.segments).toEqual([]);
      expect(melody.bpm).toBeGreaterThan(0);
      expect(melody.id).toBeTruthy();
    }
  });

  it("deals every player a distinct kit", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const room = startedGame(n);
      const dealt = room.players.map((p) => room.assignments[p.id]);
      expect(dealt.every(Boolean), `n=${n}`).toBe(true);
      expect(new Set(dealt).size, `n=${n} must be distinct`).toBe(n);
    }
  });

  it("only ever deals kits the host actually selected", () => {
    const selectedRoles = ["drums", "bass", "pad"];
    const room = startedGame(3, { selectedRoles });
    for (const player of room.players) {
      expect(selectedRoles).toContain(room.assignments[player.id]);
    }
  });

  it("arms the round clock and pushes everyone their turn", () => {
    const room = lobbyOf(3);
    const result = reduce(room, { type: "game:start", playerId: room.hostId }, ctx);

    expect(result.room.phase).toBe("playing");
    expect(result.room.round).toBe(0);
    expect(result.room.roundEndsAt).toBe(NOW + DEFAULT_CONFIG.roundDurationSec * 1000);
    expect(findEffect(result, "schedule")).toEqual({
      type: "schedule",
      key: ROUND_TIMER,
      at: NOW + DEFAULT_CONFIG.roundDurationSec * 1000,
      command: { type: "round:timeout", round: 0 },
    });
    expect(effectTypes(result)).toContain("announce-round");
  });

  it("is reproducible for a given seed", () => {
    const a = startedGame(4);
    ctx = makeCtx();
    const b = startedGame(4);
    expect(a.wheelOffsetDeg).toBe(b.wheelOffsetDeg);
    expect(a.melodies.map((m) => [m.bpm, m.root, m.scale])).toEqual(
      b.melodies.map((m) => [m.bpm, m.root, m.scale]),
    );
  });
});

/* --------------------------------- config --------------------------------- */

describe("config:update", () => {
  it("applies a sanitised patch from the host", () => {
    const room = lobbyOf(2);
    const result = reduce(
      room,
      { type: "config:update", playerId: room.hostId, config: { barsPerSong: 99 } },
      ctx,
    );
    expect(result.room.config.barsPerSong).toBe(8);
    expect(effectTypes(result)).toEqual(["snapshot"]);
  });

  it("ignores a non-host", () => {
    const room = lobbyOf(2);
    const result = reduce(
      room,
      { type: "config:update", playerId: room.players[1]!.id, config: { barsPerSong: 2 } },
      ctx,
    );
    expect(result.room.config.barsPerSong).toBe(DEFAULT_CONFIG.barsPerSong);
    expect(result.effects).toEqual([]);
  });

  it("ignores changes once the game is under way", () => {
    const room = startedGame(2);
    const result = reduce(
      room,
      { type: "config:update", playerId: room.hostId, config: { barsPerSong: 2 } },
      ctx,
    );
    expect(result.room.config.barsPerSong).toBe(DEFAULT_CONFIG.barsPerSong);
  });
});

/* ---------------------------------- turns --------------------------------- */

describe("turn:autosave", () => {
  it("stores a validated draft without putting anything on the wire", () => {
    const room = startedGame(2);
    const player = room.players[0]!;
    const notes = [noteFor(room, player.id, 0)];
    const result = reduce(room, { type: "turn:autosave", playerId: player.id, notes }, ctx);

    expect(result.effects).toEqual([]);
    expect(result.room.turns[player.id]!.draft).toEqual(notes);
  });

  it("drops notes that fail validation", () => {
    const room = startedGame(2);
    const player = room.players[0]!;
    const result = reduce(
      room,
      { type: "turn:autosave", playerId: player.id, notes: [{ pitch: 9999, start: 0, length: 1 }] },
      ctx,
    );
    expect(result.room.turns[player.id]!.draft).toEqual([]);
  });

  it("remembers the chosen sound, and leaves it alone when none is sent", () => {
    const room = startedGame(2);
    const player = room.players[0]!;

    const withSound = reduce(
      room,
      { type: "turn:autosave", playerId: player.id, notes: [], instrumentId: "fmbass" },
      ctx,
    ).room;
    expect(withSound.turns[player.id]!.instrumentId).toBe("fmbass");

    const without = reduce(
      withSound,
      { type: "turn:autosave", playerId: player.id, notes: [] },
      ctx,
    ).room;
    expect(without.turns[player.id]!.instrumentId).toBe("fmbass");
  });

  it("is ignored outside the playing phase", () => {
    const room = lobbyOf(2);
    const result = reduce(
      room,
      { type: "turn:autosave", playerId: room.players[0]!.id, notes: [] },
      ctx,
    );
    expect(result.room.turns).toEqual({});
    expect(result.effects).toEqual([]);
  });
});

describe("turn:submit", () => {
  it("records the layer, marks the player ready and tells the room", () => {
    const room = startedGame(3);
    const player = room.players[0]!;
    const notes = [noteFor(room, player.id, 0)];
    const result = reduce(room, { type: "turn:submit", playerId: player.id, notes }, ctx);

    expect(result.room.turns[player.id]).toMatchObject({ draft: notes, submitted: notes });
    expect(result.room.ready[player.id]).toBe(true);
    expect(effectTypes(result)).toContain("snapshot");
    expect(result.room.round).toBe(0); // others are not ready yet
  });

  it("ends the round as soon as the last connected player submits", () => {
    let room = startedGame(3);
    const [a, b, c] = room.players;
    room = applyAll(room, [
      { type: "turn:submit", playerId: a!.id, notes: [] },
      { type: "turn:submit", playerId: b!.id, notes: [] },
    ]);
    expect(room.round).toBe(0);

    const result = reduce(room, { type: "turn:submit", playerId: c!.id, notes: [] }, ctx);
    expect(result.room.round).toBe(1);
    expect(effectTypes(result)).toContain("broadcast");
  });

  it("does not wait on players who are not connected", () => {
    let room = startedGame(3);
    const [a, b, c] = room.players;
    room = reduce(room, { type: "player:disconnected", playerId: c!.id }, ctx).room;

    room = reduce(room, { type: "turn:submit", playerId: a!.id, notes: [] }, ctx).room;
    const result = reduce(room, { type: "turn:submit", playerId: b!.id, notes: [] }, ctx);

    expect(result.room.round).toBe(1);
  });
});

describe("player:ready", () => {
  it("toggles the flag and tells the room", () => {
    const room = startedGame(3);
    const player = room.players[0]!;
    const on = reduce(room, { type: "player:ready", playerId: player.id, ready: true }, ctx);
    expect(on.room.ready[player.id]).toBe(true);
    expect(effectTypes(on)).toContain("snapshot");

    const off = reduce(on.room, { type: "player:ready", playerId: player.id, ready: false }, ctx);
    expect(off.room.ready[player.id]).toBe(false);
    expect(off.room.round).toBe(0);
  });

  it("advances the round once everyone connected is ready", () => {
    let room = startedGame(2);
    room = reduce(
      room,
      { type: "player:ready", playerId: room.players[0]!.id, ready: true },
      ctx,
    ).room;
    const result = reduce(
      room,
      { type: "player:ready", playerId: room.players[1]!.id, ready: true },
      ctx,
    );
    expect(result.room.round).toBe(1);
  });

  it("never advances on un-readying, even if that leaves everyone else ready", () => {
    let room = startedGame(2);
    room = applyAll(room, [
      { type: "player:ready", playerId: room.players[0]!.id, ready: true },
      { type: "player:ready", playerId: room.players[0]!.id, ready: false },
    ]);
    expect(room.round).toBe(0);
  });

  it("does not advance when nobody is connected", () => {
    let room = startedGame(2);
    room = applyAll(room, [
      { type: "player:ready", playerId: room.players[0]!.id, ready: true },
      { type: "player:disconnected", playerId: room.players[0]!.id },
      { type: "player:disconnected", playerId: room.players[1]!.id },
    ]);
    const result = reduce(
      room,
      { type: "player:ready", playerId: room.players[1]!.id, ready: true },
      ctx,
    );
    expect(result.room.round).toBe(0);
  });
});

/* --------------------------------- rounds --------------------------------- */

describe("round:timeout", () => {
  it("ends the round it was armed for", () => {
    const room = startedGame(3);
    const result = reduce(room, { type: "round:timeout", round: 0 }, ctx);
    expect(result.room.round).toBe(1);
  });

  it("ignores a timer armed for an earlier round", () => {
    // A round that ended early leaves its timer in flight; it must not cut the
    // next round short.
    let room = startedGame(2);
    room = applyAll(room, [
      { type: "turn:submit", playerId: room.players[0]!.id, notes: [] },
      { type: "turn:submit", playerId: room.players[1]!.id, notes: [] },
    ]);
    expect(room.round).toBe(1);

    const result = reduce(room, { type: "round:timeout", round: 0 }, ctx);
    expect(result.room.round).toBe(1);
    expect(result.effects).toEqual([]);
  });

  it("commits whatever each player had, submitted or merely autosaved", () => {
    let room = startedGame(3);
    const [a, b] = room.players;
    const submitted = [noteFor(room, a!.id, 4)];
    const draftOnly = [noteFor(room, b!.id, 8)];

    room = applyAll(room, [
      { type: "turn:submit", playerId: a!.id, notes: submitted },
      { type: "turn:autosave", playerId: b!.id, notes: draftOnly },
    ]);

    const after = reduce(room, { type: "round:timeout", round: 0 }, ctx).room;
    const notesByAuthor = new Map(
      after.melodies.flatMap((m) => m.segments).map((s) => [s.authorId, s.notes]),
    );

    expect(notesByAuthor.get(a!.id)).toEqual(submitted);
    expect(notesByAuthor.get(b!.id)).toEqual(draftOnly);
    expect(notesByAuthor.get(room.players[2]!.id)).toEqual([]);
  });

  it("prefers the submitted notes over a later-superseded draft", () => {
    let room = startedGame(2);
    const player = room.players[0]!;
    const superseded = [noteFor(room, player.id, 0)];
    const final = [noteFor(room, player.id, 12)];
    room = applyAll(room, [
      { type: "turn:autosave", playerId: player.id, notes: superseded },
      { type: "turn:submit", playerId: player.id, notes: final },
    ]);

    const after = reduce(room, { type: "round:timeout", round: 0 }, ctx).room;
    const segment = after.melodies.flatMap((m) => m.segments).find((s) => s.authorId === player.id);
    expect(segment!.notes).toEqual(final);
  });

  it("stamps each committed layer with its author, round and dealt kit", () => {
    const room = startedGame(3);
    const after = reduce(room, { type: "round:timeout", round: 0 }, ctx).room;

    for (const segment of after.melodies.flatMap((m) => m.segments)) {
      const player = room.players.find((p) => p.id === segment.authorId)!;
      expect(segment.authorName).toBe(player.name);
      expect(segment.order).toBe(0);
      expect(segment.roleId).toBe(room.assignments[player.id]);
    }
  });

  it("clears every player's working state when the next round begins", () => {
    let room = startedGame(3);
    room = reduce(
      room,
      {
        type: "turn:autosave",
        playerId: room.players[0]!.id,
        notes: [noteFor(room, room.players[0]!.id, 0)],
      },
      ctx,
    ).room;

    const after = reduce(room, { type: "round:timeout", round: 0 }, ctx).room;
    expect(after.turns).toEqual({});
    expect(after.ready).toEqual({});
    expect(after.roundEndsAt).toBe(NOW + DEFAULT_CONFIG.roundDurationSec * 1000);
  });
});

/* -------------------------------- full game ------------------------------- */

/** Play every round of an `n`-player game to completion. */
function finishGame(n: number): Room {
  let room = startedGame(n);
  for (let round = 0; round < room.totalRounds; round++) {
    room = reduce(room, { type: "round:timeout", round }, ctx).room;
  }
  return room;
}

describe("a full game", () => {
  it("ends in results with the reveal ready to start", () => {
    const room = finishGame(3);
    expect(room.phase).toBe("results");
    expect(room.reveal).toEqual({
      activeSong: 0,
      revealedLayers: 0,
      playing: false,
      done: false,
    });
  });

  it("announces the finished songs exactly once, on the last round", () => {
    let room = startedGame(3);
    const finals: Effect[] = [];
    for (let round = 0; round < room.totalRounds; round++) {
      const result = reduce(room, { type: "round:timeout", round }, ctx);
      room = result.room;
      finals.push(
        ...result.effects.filter(
          (e) => e.type === "broadcast" && e.message.type === "game:finished",
        ),
      );
    }
    expect(finals).toHaveLength(1);
  });

  it("gives every song one layer per player, with no player appearing twice", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const room = finishGame(n);
      for (const melody of room.melodies) {
        expect(melody.segments, `n=${n}`).toHaveLength(n);
        const authors = melody.segments.map((s) => s.authorId);
        expect(new Set(authors).size, `n=${n} song ${melody.id}`).toBe(n);
        expect(melody.segments.map((s) => s.order)).toEqual(Array.from({ length: n }, (_, i) => i));
      }
    }
  });

  it("has every player contribute to every song exactly once", () => {
    const n = 5;
    const room = finishGame(n);
    for (const player of room.players) {
      const contributed = room.melodies.filter((m) =>
        m.segments.some((s) => s.authorId === player.id),
      );
      expect(contributed).toHaveLength(n);
    }
  });

  it("keeps each player on the single kit they were dealt, all game long", () => {
    const room = finishGame(4);
    for (const player of room.players) {
      const roles = room.melodies
        .flatMap((m) => m.segments)
        .filter((s) => s.authorId === player.id)
        .map((s) => s.roleId);
      expect(new Set(roles)).toEqual(new Set([room.assignments[player.id]]));
    }
  });

  it("stops arming the round clock once the game is over", () => {
    let room = startedGame(2);
    room = reduce(room, { type: "round:timeout", round: 0 }, ctx).room;
    const last = reduce(room, { type: "round:timeout", round: 1 }, ctx);

    expect(last.room.phase).toBe("results");
    expect(last.effects.filter((e) => e.type === "schedule")).toEqual([]);
  });
});

/* --------------------------------- reveal --------------------------------- */

describe("reveal:update", () => {
  /** A finished 3-player game, plus the id of song 0's author. */
  function revealing(): { room: Room; presenter: string } {
    const room = finishGame(3);
    return { room, presenter: room.melodies[0]!.seedPlayerId };
  }

  it("lets the current song's author reveal a layer", () => {
    const { room, presenter } = revealing();
    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: presenter,
        activeSong: 0,
        revealedLayers: 1,
        playing: true,
      },
      ctx,
    );
    expect(result.room.reveal).toMatchObject({ activeSong: 0, revealedLayers: 1, playing: true });
    expect(effectTypes(result)).toEqual(["snapshot"]);
  });

  it("ignores anyone who is not presenting", () => {
    const { room, presenter } = revealing();
    const other = room.players.find((p) => p.id !== presenter)!;
    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: other.id,
        activeSong: 0,
        revealedLayers: 3,
        playing: true,
      },
      ctx,
    );
    expect(result.room.reveal.revealedLayers).toBe(0);
    expect(result.effects).toEqual([]);
  });

  it("clamps the layer cursor to what the song actually has", () => {
    const { room, presenter } = revealing();
    const tooMany = reduce(
      room,
      {
        type: "reveal:update",
        playerId: presenter,
        activeSong: 0,
        revealedLayers: 99,
        playing: true,
      },
      ctx,
    );
    expect(tooMany.room.reveal.revealedLayers).toBe(3);

    const negative = reduce(
      room,
      {
        type: "reveal:update",
        playerId: presenter,
        activeSong: 0,
        revealedLayers: -5,
        playing: true,
      },
      ctx,
    );
    expect(negative.room.reveal.revealedLayers).toBe(0);
  });

  it("hands presenting to the next song's author when advancing", () => {
    const { room, presenter } = revealing();
    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: presenter,
        activeSong: 1,
        revealedLayers: 0,
        playing: false,
      },
      ctx,
    );
    expect(result.room.reveal).toEqual({
      activeSong: 1,
      revealedLayers: 0,
      playing: false,
      done: false,
    });
  });

  it("marks the reveal done after the last song", () => {
    let room = finishGame(2);
    for (let song = 0; song < room.melodies.length; song++) {
      const presenter = room.melodies[room.reveal.activeSong]!.seedPlayerId;
      room = reduce(
        room,
        {
          type: "reveal:update",
          playerId: presenter,
          activeSong: song + 1,
          revealedLayers: 0,
          playing: false,
        },
        ctx,
      ).room;
    }
    expect(room.reveal.done).toBe(true);
  });

  it("ignores an out-of-order jump", () => {
    const { room, presenter } = revealing();
    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: presenter,
        activeSong: 2,
        revealedLayers: 0,
        playing: false,
      },
      ctx,
    );
    expect(result.room.reveal.activeSong).toBe(0);
    expect(result.effects).toEqual([]);
  });

  it("ignores everything once the reveal is done", () => {
    let room = finishGame(2);
    for (let song = 0; song < room.melodies.length; song++) {
      const presenter = room.melodies[room.reveal.activeSong]!.seedPlayerId;
      room = reduce(
        room,
        {
          type: "reveal:update",
          playerId: presenter,
          activeSong: song + 1,
          revealedLayers: 0,
          playing: false,
        },
        ctx,
      ).room;
    }

    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: room.melodies[0]!.seedPlayerId,
        activeSong: 0,
        revealedLayers: 1,
        playing: true,
      },
      ctx,
    );
    expect(result.effects).toEqual([]);
  });

  it("is ignored before the game reaches results", () => {
    const room = startedGame(2);
    const result = reduce(
      room,
      {
        type: "reveal:update",
        playerId: room.players[0]!.id,
        activeSong: 0,
        revealedLayers: 1,
        playing: true,
      },
      ctx,
    );
    expect(result.effects).toEqual([]);
  });
});

/* ---------------------------------- reap ---------------------------------- */

describe("room:reap", () => {
  it("destroys a room nobody is left in", () => {
    let room = lobbyOf(1);
    room = reduce(room, { type: "player:disconnected", playerId: room.players[0]!.id }, ctx).room;
    const result = reduce(room, { type: "room:reap" }, ctx);
    expect(result.effects).toEqual([{ type: "destroy" }]);
  });

  it("spares a room somebody reconnected to before the timer landed", () => {
    const room = lobbyOf(2);
    expect(reduce(room, { type: "room:reap" }, ctx).effects).toEqual([]);
  });
});
