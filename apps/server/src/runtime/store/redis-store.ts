import type { Redis } from "ioredis";
import type { Room } from "@musicphone/shared";
import type { RoomStore, VersionedRoom } from "./types";

/**
 * How long a room survives without being written to.
 *
 * This is a backstop, not the normal cleanup path — the reaper still collects
 * an empty room a minute after the last player goes. It exists so that nothing
 * can be left behind for good: a room the server crashed while holding, or one
 * whose reap timer died with the process, disappears on its own. Long enough to
 * outlive any real game (eight players at ten-minute rounds, plus lobby and
 * reveal), short enough that debris does not accumulate.
 */
export const ROOM_TTL_SECONDS = 4 * 60 * 60;

const KEY_PREFIX = "room:";
const key = (code: string) => `${KEY_PREFIX}${code}`;

/**
 * Create a room only if its code is free.
 *
 * EXISTS-then-write is a race across instances; as a script it is atomic, so
 * two servers picking the same code cannot both believe they won it.
 */
const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'version', '1', 'data', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`;

/**
 * Write a room back only if nobody else has written since it was read.
 *
 * This is the compare-and-set the RoomStore contract is built around: the
 * loser of a race is told to re-read and retry rather than silently discarding
 * the winner's changes.
 */
const SAVE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'version')
if current == false then return 0 end
if current ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'version', ARGV[2], 'data', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

/**
 * Redis-backed RoomStore.
 *
 * Rooms are a hash of `version` and a JSON `data` blob. Keeping the version as
 * its own field means the compare-and-set never has to parse JSON inside Lua.
 *
 * Every write refreshes the TTL, so a room stays alive exactly as long as it is
 * being played.
 */
export class RedisRoomStore implements RoomStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number = ROOM_TTL_SECONDS,
  ) {}

  async load(code: string): Promise<VersionedRoom | undefined> {
    const [version, data] = await this.redis.hmget(key(code), "version", "data");
    // Missing fields come back as null; a short reply would leave them
    // undefined. Either way there is no room here.
    if (version == null || data == null) return undefined;

    const parsed = Number(version);
    if (!Number.isInteger(parsed)) return undefined;

    try {
      return { room: JSON.parse(data) as Room, version: parsed };
    } catch {
      // A corrupt payload is unrecoverable and would otherwise crash every
      // command for this room. Treat it as absent and let it expire.
      console.error(`[room ${code}] stored payload is not valid JSON; ignoring`);
      return undefined;
    }
  }

  async create(room: Room): Promise<boolean> {
    const result = await this.redis.eval(
      CREATE_SCRIPT,
      1,
      key(room.code),
      JSON.stringify(room),
      String(this.ttlSeconds),
    );
    return result === 1;
  }

  async save(room: Room, expectedVersion: number): Promise<number | undefined> {
    const nextVersion = expectedVersion + 1;
    const result = await this.redis.eval(
      SAVE_SCRIPT,
      1,
      key(room.code),
      String(expectedVersion),
      String(nextVersion),
      JSON.stringify(room),
      String(this.ttlSeconds),
    );
    return result === 1 ? nextVersion : undefined;
  }

  async delete(code: string): Promise<void> {
    await this.redis.del(key(code));
  }

  /**
   * Every room code currently stored.
   *
   * SCAN rather than KEYS: this runs at boot to re-arm round timers, and KEYS
   * would block the server for everyone else while it walked the keyspace.
   */
  async codes(): Promise<string[]> {
    const found: string[] = [];
    let cursor = "0";
    do {
      const [next, batch] = await this.redis.scan(cursor, "MATCH", `${KEY_PREFIX}*`, "COUNT", 100);
      cursor = next;
      for (const raw of batch) found.push(raw.slice(KEY_PREFIX.length));
    } while (cursor !== "0");
    // SCAN may return the same key twice across cursor pages.
    return [...new Set(found)];
  }
}
