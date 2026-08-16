import type { GameConfig, Room, ServerMessage } from "@musicphone/shared";
import type { Command } from "../game/commands";
import type { Effect } from "../game/effects";
import { createRoom, joinRoom, randomCode } from "../game/create";
import { REAP_TIMER } from "../game/effects";
import {
  EMPTY_ROOM_TTL_MS,
  reduce,
  roundStartedMessage,
  type ReducerContext,
} from "../game/reducer";
import { toSnapshot } from "../game/serialize";
import type { RoomBus } from "./bus/types";
import type { RoundScheduler } from "./scheduler/types";
import type { RoomStore } from "./store/types";

/** How many times a write may lose the version race before we give up. */
const MAX_SAVE_ATTEMPTS = 5;

/** How many codes to try before admitting we cannot allocate one. */
const MAX_CODE_ATTEMPTS = 10;

export interface RoomServiceOptions {
  store: RoomStore;
  bus: RoomBus;
  scheduler: RoundScheduler;
  /** Overridable for tests; defaults to wall clock, Math.random and randomUUID. */
  context?: () => ReducerContext;
}

export type CreateResult = { code: string; playerId: string };
export type JoinOutcome = { code: string; playerId: string } | { error: string };

/**
 * Drives rooms: load, reduce, persist, then carry out the effects.
 *
 * All the ordering rules live here rather than in the reducer. Two matter:
 *
 * - Effects run only after the new state is safely stored. A snapshot that
 *   describes a room state which failed to persist would be a lie.
 * - Commands for one room are serialised. The store's version guard would catch
 *   an interleaving anyway, but a queue makes ordering deterministic instead of
 *   merely safe, which matters when a burst of submits decides who ends a round.
 */
export class RoomService {
  private readonly store: RoomStore;
  private readonly bus: RoomBus;
  private readonly scheduler: RoundScheduler;
  private readonly context: () => ReducerContext;

  /** Per-room promise chain, serialising work on a single room. */
  private queues = new Map<string, Promise<unknown>>();

  constructor(options: RoomServiceOptions) {
    this.store = options.store;
    this.bus = options.bus;
    this.scheduler = options.scheduler;
    this.context =
      options.context ??
      (() => ({ now: Date.now(), random: Math.random, uuid: () => crypto.randomUUID() }));
  }

  /* -------------------------------- lobby -------------------------------- */

  /** Create a room under a free code, with the caller as host. */
  async create(hostName: string, config?: Partial<GameConfig>): Promise<CreateResult> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const ctx = this.context();
      const code = randomCode(ctx.random);
      const { room, playerId } = createRoom(code, hostName, config, ctx);
      if (!(await this.store.create(room))) continue;

      // A room is born empty: nobody connects until the host's browser opens a
      // socket. Without this, a room created and then abandoned — or created by
      // a script that never connects — would sit there for good, because the
      // reaper was only ever armed when someone left.
      this.scheduler.schedule(code, REAP_TIMER, ctx.now + EMPTY_ROOM_TTL_MS, () => {
        void this.dispatch(code, { type: "room:reap" });
      });

      return { code, playerId };
    }
    throw new Error("Could not allocate a room code");
  }

  /** Add a player to a room that is still in its lobby. */
  async join(code: string, name: string): Promise<JoinOutcome> {
    return this.enqueue(code, async () => {
      for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
        const loaded = await this.store.load(code);
        if (!loaded) return { error: "Room not found" };

        const result = joinRoom(loaded.room, name, this.context());
        if ("error" in result) return result;

        const version = await this.store.save(result.room, loaded.version);
        if (version !== undefined) {
          this.runEffects(result.room, [{ type: "snapshot" }]);
          return { code: result.room.code, playerId: result.playerId };
        }
      }
      return { error: "Room is busy, try again" };
    });
  }

  async get(code: string): Promise<Room | undefined> {
    return (await this.store.load(code))?.room;
  }

  /* ------------------------------ dispatching ----------------------------- */

  /**
   * Apply a command to a room and carry out whatever it asks for.
   *
   * Returns the error the reducer refused with, if any, so the caller can
   * report it to whoever issued the command.
   */
  async dispatch(code: string, command: Command): Promise<string | undefined> {
    return this.enqueue(code, async () => {
      for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
        const loaded = await this.store.load(code);
        if (!loaded) return "Room not found";

        const result = reduce(loaded.room, command, this.context());
        if (result.error) return result.error;
        // Nothing changed and nothing to do — skip the write entirely.
        if (result.effects.length === 0 && result.room === loaded.room) return undefined;

        const version = await this.store.save(result.room, loaded.version);
        if (version === undefined) continue; // lost the race; re-read and retry

        this.runEffects(result.room, result.effects);
        return undefined;
      }
      console.error(`[room ${code}] gave up applying ${command.type} after contention`);
      return "Room is busy, try again";
    });
  }

  /* -------------------------------- effects ------------------------------- */

  private runEffects(room: Room, effects: Effect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "snapshot":
          this.bus.sendPerPlayer(room.code, (playerId) => ({
            type: "room:snapshot",
            room: toSnapshot(room, playerId),
          }));
          break;

        case "broadcast":
          this.bus.sendToRoom(room.code, effect.message);
          break;

        case "send":
          this.bus.sendToPlayer(room.code, effect.playerId, effect.message);
          break;

        case "announce-round":
          this.bus.sendPerPlayer(room.code, (playerId) => this.roundMessage(room, playerId));
          break;

        case "announce-round-to": {
          const message = this.roundMessage(room, effect.playerId);
          if (message) this.bus.sendToPlayer(room.code, effect.playerId, message);
          break;
        }

        case "schedule":
          this.scheduler.schedule(room.code, effect.key, effect.at, () => {
            void this.dispatch(room.code, effect.command);
          });
          break;

        case "cancel":
          this.scheduler.cancel(room.code, effect.key);
          break;

        case "destroy":
          this.scheduler.cancelRoom(room.code);
          void this.store.delete(room.code);
          break;
      }
    }
  }

  /** A player's `round:started`, or undefined if they are not in this room. */
  private roundMessage(room: Room, playerId: string): ServerMessage | undefined {
    const index = room.players.findIndex((p) => p.id === playerId);
    return index >= 0 ? roundStartedMessage(room, index) : undefined;
  }

  /* --------------------------------- queue -------------------------------- */

  /** Run `task` after everything already queued for this room. */
  private enqueue<T>(code: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(code) ?? Promise.resolve();
    // `task` runs whether the predecessor settled or threw: one failed command
    // must not wedge every later command for the same room.
    const result = previous.then(task, task);

    // The chain itself is kept rejection-proof, so a throw propagates to this
    // caller only and never to whoever queues up behind them.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(code, tail);
    void tail.then(() => {
      // Drop the entry once idle so room codes do not accumulate forever.
      if (this.queues.get(code) === tail) this.queues.delete(code);
    });

    return result;
  }
}
