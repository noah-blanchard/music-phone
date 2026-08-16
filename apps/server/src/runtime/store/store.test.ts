import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import type { Room } from "@musicphone/shared";
import { createRoom } from "../../game/create";
import type { ReducerContext } from "../../game/reducer";
import { MemoryRoomStore } from "./memory-store";
import { RedisRoomStore } from "./redis-store";
import type { RoomStore } from "./types";

const ctx: ReducerContext = { now: 0, random: () => 0.5, uuid: () => "host-id" };

function room(code: string): Room {
  return createRoom(code, "Host", undefined, ctx).room;
}

/**
 * The contract every RoomStore must satisfy, run against each implementation so
 * they cannot drift apart. The Redis store is added to this list once it exists.
 */
export function describeRoomStore(name: string, makeStore: () => RoomStore): void {
  describe(name, () => {
    it("returns undefined for a room that does not exist", async () => {
      await expect(makeStore().load("NOPE")).resolves.toBeUndefined();
    });

    it("stores and reads back a room at version 1", async () => {
      const store = makeStore();
      await expect(store.create(room("ABCD"))).resolves.toBe(true);

      const loaded = await store.load("ABCD");
      expect(loaded?.version).toBe(1);
      expect(loaded?.room.code).toBe("ABCD");
      expect(loaded?.room.phase).toBe("lobby");
    });

    it("refuses to create over an existing code", async () => {
      const store = makeStore();
      await store.create(room("ABCD"));
      await expect(store.create(room("ABCD"))).resolves.toBe(false);
    });

    it("bumps the version on each successful save", async () => {
      const store = makeStore();
      await store.create(room("ABCD"));

      const first = await store.load("ABCD");
      await expect(store.save(first!.room, first!.version)).resolves.toBe(2);

      const second = await store.load("ABCD");
      expect(second!.version).toBe(2);
      await expect(store.save(second!.room, second!.version)).resolves.toBe(3);
    });

    it("rejects a save made against a stale version", async () => {
      const store = makeStore();
      await store.create(room("ABCD"));
      const stale = await store.load("ABCD");

      // Someone else writes first.
      await store.save(stale!.room, stale!.version);

      // The stale writer must be told to re-read rather than clobbering.
      await expect(store.save(stale!.room, stale!.version)).resolves.toBeUndefined();
    });

    it("rejects a save to a room that no longer exists", async () => {
      const store = makeStore();
      await expect(store.save(room("GONE"), 1)).resolves.toBeUndefined();
    });

    it("persists changes between writes", async () => {
      const store = makeStore();
      await store.create(room("ABCD"));

      const loaded = await store.load("ABCD");
      loaded!.room.phase = "results";
      await store.save(loaded!.room, loaded!.version);

      expect((await store.load("ABCD"))!.room.phase).toBe("results");
    });

    it("isolates stored state from the caller's object", async () => {
      const store = makeStore();
      const original = room("ABCD");
      await store.create(original);

      // Mutating the object that was handed in must not reach the store...
      original.phase = "results";
      expect((await store.load("ABCD"))!.room.phase).toBe("lobby");

      // ...nor must mutating one that was handed out.
      const loaded = await store.load("ABCD");
      loaded!.room.players.push({ id: "x", name: "X", connected: true, isHost: false });
      expect((await store.load("ABCD"))!.room.players).toHaveLength(1);
    });

    it("deletes a room, and tolerates deleting one that is already gone", async () => {
      const store = makeStore();
      await store.create(room("ABCD"));
      await store.delete("ABCD");
      await expect(store.load("ABCD")).resolves.toBeUndefined();
      await expect(store.delete("ABCD")).resolves.toBeUndefined();
    });

    it("lists the codes it holds", async () => {
      const store = makeStore();
      await expect(store.codes()).resolves.toEqual([]);

      await store.create(room("ABCD"));
      await store.create(room("WXYZ"));
      expect((await store.codes()).sort()).toEqual(["ABCD", "WXYZ"]);

      await store.delete("ABCD");
      await expect(store.codes()).resolves.toEqual(["WXYZ"]);
    });
  });
}

describeRoomStore("MemoryRoomStore", () => new MemoryRoomStore());

/**
 * The same contract against a real Redis, so the two implementations cannot
 * drift. Skipped when REDIS_TEST_URL is unset, which keeps `bun run test`
 * working with nothing installed; CI sets it against a service container.
 */
const REDIS_TEST_URL = process.env.REDIS_TEST_URL;

describe.skipIf(!REDIS_TEST_URL)("RedisRoomStore", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(REDIS_TEST_URL!, { maxRetriesPerRequest: 2 });
    await redis.ping();
  });

  afterEach(async () => {
    // Each test builds its own rooms; start every one from an empty keyspace.
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis?.quit();
  });

  describeRoomStore("contract", () => new RedisRoomStore(redis));

  it("expires a room that stops being written to", async () => {
    const store = new RedisRoomStore(redis, 1);
    await store.create(room("TTL1"));
    await expect(store.load("TTL1")).resolves.toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 1200));
    await expect(store.load("TTL1")).resolves.toBeUndefined();
  });

  it("pushes the expiry back on every write, so a live game is never collected", async () => {
    const store = new RedisRoomStore(redis, 2);
    await store.create(room("TTL2"));

    // Keep touching it for longer than the TTL.
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const loaded = await store.load("TTL2");
      expect(loaded, `still present on write ${i}`).toBeDefined();
      await store.save(loaded!.room, loaded!.version);
    }

    await expect(store.load("TTL2")).resolves.toBeDefined();
  });

  it("survives a client reconnecting, since state lives in Redis not the process", async () => {
    const first = new RedisRoomStore(redis);
    await first.create(room("PERSIST"));

    const other = new Redis(REDIS_TEST_URL!, { maxRetriesPerRequest: 2 });
    try {
      const second = new RedisRoomStore(other);
      const loaded = await second.load("PERSIST");
      expect(loaded?.room.code).toBe("PERSIST");
    } finally {
      await other.quit();
    }
  });

  it("treats an unparseable payload as absent rather than crashing the room", async () => {
    await redis.hset("room:BROKEN", "version", "1", "data", "{not json");
    await expect(new RedisRoomStore(redis).load("BROKEN")).resolves.toBeUndefined();
  });

  it("lets exactly one of two racing creators win a code", async () => {
    const store = new RedisRoomStore(redis);
    const results = await Promise.all([
      store.create(room("RACE")),
      store.create(room("RACE")),
      store.create(room("RACE")),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("lets exactly one of two racing writers win a version", async () => {
    const store = new RedisRoomStore(redis);
    await store.create(room("CAS"));
    const loaded = await store.load("CAS");

    const results = await Promise.all([
      store.save(loaded!.room, loaded!.version),
      store.save(loaded!.room, loaded!.version),
    ]);
    expect(results.filter((r) => r !== undefined)).toHaveLength(1);
  });
});
