import {
  BPM_CHOICES,
  KEY_CHOICES,
  LAYER_ROLES,
  MIN_PLAYERS,
  SCALE_CHOICES,
  assignWheel,
  canControlReveal,
  getMode,
  getRole,
  sanitizeConfig,
  type Melody,
  type Role,
  type Room,
  type ScaleType,
  type ServerMessage,
  type TurnState,
} from "@musicphone/shared";
import type { Command } from "./commands";
import { REAP_TIMER, ROUND_TIMER, graceTimer, type Effect } from "./effects";

/** How long an empty room is kept before it is collected. */
export const EMPTY_ROOM_TTL_MS = 60_000;

/**
 * How long a disconnected lobby player keeps their slot. A socket close is
 * usually transient (reload, tab switch, flaky wifi), so removal waits for this
 * window and a reconnect cancels it. Mid-game the slot is never given up: the
 * rotation is sized to the player count locked in at start.
 */
export const LEAVE_GRACE_MS = 5_000;

/**
 * Everything impure the rules need. Injecting these is what makes the reducer
 * deterministic under test: a fixed clock and a seeded `random` pin the wheel
 * offset and the per-song slot-machine rolls exactly.
 */
export interface ReducerContext {
  /** Current time in epoch milliseconds. */
  now: number;
  /** Uniform in [0, 1), like Math.random. */
  random: () => number;
  /** A fresh unique id. */
  uuid: () => string;
}

export interface ReduceResult {
  /** The room after the command. Always a new object; the input is untouched. */
  room: Room;
  effects: Effect[];
  /**
   * Set when the command was refused. The runtime reports it to the player who
   * issued it; the room is returned unchanged.
   */
  error?: string;
}

function pick<T>(arr: readonly T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)]!;
}

/**
 * The role a player was dealt by the wheel. Falls back to the first selected
 * role, then to the first role overall, so a malformed assignment degrades to a
 * playable turn rather than throwing mid-round.
 */
function roleOf(room: Room, playerId: string): Role {
  return (
    getRole(room.assignments[playerId]) ?? getRole(room.config.selectedRoles[0]) ?? LAYER_ROLES[0]!
  );
}

/** The player's working state for this round, created on first write. */
function turnOf(room: Room, playerId: string): TurnState {
  const existing = room.turns[playerId];
  if (existing) return existing;
  const created: TurnState = { draft: [] };
  room.turns[playerId] = created;
  return created;
}

/** Build the `round:started` payload for one player. */
export function roundStartedMessage(room: Room, playerIndex: number): ServerMessage {
  const mode = getMode(room.config.mode);
  const player = room.players[playerIndex]!;
  const song = room.melodies[mode.assign(playerIndex, room.round, room.players.length)]!;
  return {
    type: "round:started",
    round: room.round,
    contextLayers: mode.buildContext(song, room.round, room.config),
    role: roleOf(room, player.id),
    song: { bpm: song.bpm, root: song.root, scale: song.scale },
    isFirstLayer: song.segments.length === 0,
    endsAt: room.roundEndsAt,
  };
}

/** Reset per-round state, arm the clock and push everyone their turn. */
function beginRound(room: Room, ctx: ReducerContext): Effect[] {
  room.ready = {};
  room.turns = {};
  room.roundEndsAt = ctx.now + room.config.roundDurationSec * 1000;

  return [
    {
      type: "schedule",
      key: ROUND_TIMER,
      at: room.roundEndsAt,
      command: { type: "round:timeout", round: room.round },
    },
    { type: "snapshot" },
    { type: "announce-round" },
  ];
}

/** Commit every player's layer for the current round, then move on. */
function advanceRound(room: Room, ctx: ReducerContext): Effect[] {
  if (room.phase !== "playing") return [];

  const mode = getMode(room.config.mode);
  const n = room.players.length;
  room.players.forEach((player, idx) => {
    const turn = room.turns[player.id];
    const melody = room.melodies[mode.assign(idx, room.round, n)]!;
    melody.segments.push({
      authorId: player.id,
      authorName: player.name,
      order: room.round,
      roleId: roleOf(room, player.id).id,
      instrumentId: turn?.instrumentId,
      notes: turn?.submitted ?? turn?.draft ?? [],
    });
  });

  const effects: Effect[] = [
    { type: "cancel", key: ROUND_TIMER },
    { type: "broadcast", message: { type: "round:ended", round: room.round } },
  ];

  room.round += 1;

  if (room.round < room.totalRounds) return [...effects, ...beginRound(room, ctx)];

  room.phase = "results";
  // Start the room-wide guided reveal at the first song, nothing revealed.
  room.reveal = { activeSong: 0, revealedLayers: 0, playing: false, done: false };
  return [
    ...effects,
    { type: "broadcast", message: { type: "game:finished", melodies: room.melodies } },
    { type: "snapshot" },
  ];
}

/** Advance early once every connected player is ready. */
function maybeAdvance(room: Room, ctx: ReducerContext): Effect[] {
  const connected = room.players.filter((p) => p.connected);
  if (connected.length === 0) return [];
  if (!connected.every((p) => room.ready[p.id])) return [];
  return advanceRound(room, ctx);
}

/**
 * What to do after someone goes away: collect the room once nobody is left,
 * otherwise tell the survivors.
 */
function afterDeparture(room: Room, ctx: ReducerContext): Effect[] {
  const anyoneLeft = room.players.some((p) => p.connected);
  if (anyoneLeft) return [{ type: "snapshot" }];
  return [
    {
      type: "schedule",
      key: REAP_TIMER,
      at: ctx.now + EMPTY_ROOM_TTL_MS,
      command: { type: "room:reap" },
    },
  ];
}

/** Remove a player from the lobby, handing the host role on if they held it. */
function removeFromLobby(room: Room, playerId: string): void {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (room.players.length > 0 && playerId === room.hostId) {
    const next = room.players[0]!;
    next.isHost = true;
    room.hostId = next.id;
  }
}

function refuse(room: Room, error: string): ReduceResult {
  return { room, effects: [], error };
}

/**
 * Apply one command to a room.
 *
 * Pure: the input room is never mutated, and every source of nondeterminism
 * arrives through `ctx`. The returned effects are the only way anything reaches
 * a socket, a timer or the store.
 */
export function reduce(room: Room, command: Command, ctx: ReducerContext): ReduceResult {
  const next = structuredClone(room);

  switch (command.type) {
    case "player:connected": {
      const player = next.players.find((p) => p.id === command.playerId);
      if (!player) return refuse(room, "Unknown room or player");
      player.connected = true;

      const effects: Effect[] = [
        { type: "cancel", key: REAP_TIMER },
        { type: "cancel", key: graceTimer(command.playerId) },
        { type: "snapshot" },
      ];
      // Bring the (re)connecting player up to date on whatever is in progress.
      if (next.phase === "playing") {
        effects.push({ type: "announce-round-to", playerId: command.playerId });
      } else if (next.phase === "results") {
        effects.push({
          type: "send",
          playerId: command.playerId,
          message: { type: "game:finished", melodies: next.melodies },
        });
      }
      return { room: next, effects };
    }

    case "player:disconnected": {
      const player = next.players.find((p) => p.id === command.playerId);
      if (!player) return { room, effects: [] };
      player.connected = false;

      const effects: Effect[] = [];
      if (next.phase === "lobby") {
        effects.push({
          type: "schedule",
          key: graceTimer(command.playerId),
          at: ctx.now + LEAVE_GRACE_MS,
          command: { type: "player:grace-expired", playerId: command.playerId },
        });
      }
      return { room: next, effects: [...effects, ...afterDeparture(next, ctx)] };
    }

    case "player:grace-expired":
    case "player:left": {
      const player = next.players.find((p) => p.id === command.playerId);
      if (!player) return { room, effects: [] };

      const effects: Effect[] = [{ type: "cancel", key: graceTimer(command.playerId) }];
      if (next.phase === "lobby") {
        removeFromLobby(next, command.playerId);
      } else {
        // Mid-game the slot is kept so the melody chain stays intact.
        player.connected = false;
      }
      return { room: next, effects: [...effects, ...afterDeparture(next, ctx)] };
    }

    case "game:start": {
      if (command.playerId !== next.hostId) return refuse(room, "Only the host can start the game");
      if (next.phase !== "lobby") return refuse(room, "Game already started");
      if (next.players.length < MIN_PLAYERS)
        return refuse(room, `Need at least ${MIN_PLAYERS} players`);

      const n = next.players.length;
      const roles = next.config.selectedRoles;
      if (roles.length < n)
        return refuse(room, `Select at least ${n} layer kinds (one per player)`);

      next.totalRounds = getMode(next.config.mode).totalRounds(n, next.config);
      // Each song rolls its own tempo and key, revealed by the slot machine.
      next.melodies = next.players.map<Melody>((p) => ({
        id: ctx.uuid(),
        seedPlayerId: p.id,
        bpm: pick(BPM_CHOICES, ctx.random),
        root: pick(KEY_CHOICES, ctx.random),
        scale: pick(SCALE_CHOICES, ctx.random) as ScaleType,
        segments: [],
      }));

      // Spin the wheel to a random offset and read off each player's section.
      // Re-roll on the rare boundary collision (see assignWheel's tests).
      let offsetDeg = 0;
      let sections: number[] = [];
      for (let tries = 0; tries < 24; tries++) {
        offsetDeg = ctx.random() * 360;
        sections = assignWheel(n, roles.length, offsetDeg);
        if (new Set(sections).size === n) break;
      }
      next.wheelOffsetDeg = offsetDeg;
      next.assignments = {};
      next.players.forEach((p, i) => {
        next.assignments[p.id] = roles[sections[i]!] ?? roles[i % roles.length]!;
      });

      next.phase = "playing";
      next.round = 0;
      return { room: next, effects: beginRound(next, ctx) };
    }

    case "config:update": {
      if (next.phase !== "lobby" || command.playerId !== next.hostId) return { room, effects: [] };
      next.config = sanitizeConfig(command.config, next.config);
      return { room: next, effects: [{ type: "snapshot" }] };
    }

    case "turn:autosave": {
      if (next.phase !== "playing") return { room, effects: [] };
      const clean = getMode(next.config.mode).validateTurn(
        command.notes,
        next.config,
        roleOf(next, command.playerId),
      );
      const turn = turnOf(next, command.playerId);
      turn.draft = clean;
      if (command.instrumentId) turn.instrumentId = command.instrumentId;
      // Deliberately silent: autosave fires on every edit and must not put a
      // snapshot on the wire for each keystroke.
      return { room: next, effects: [] };
    }

    case "turn:submit": {
      if (next.phase !== "playing") return { room, effects: [] };
      const clean = getMode(next.config.mode).validateTurn(
        command.notes,
        next.config,
        roleOf(next, command.playerId),
      );
      const turn = turnOf(next, command.playerId);
      turn.draft = clean;
      turn.submitted = clean;
      if (command.instrumentId) turn.instrumentId = command.instrumentId;
      next.ready[command.playerId] = true;
      return { room: next, effects: [{ type: "snapshot" }, ...maybeAdvance(next, ctx)] };
    }

    case "player:ready": {
      if (next.phase !== "playing") return { room, effects: [] };
      next.ready[command.playerId] = command.ready;
      const effects: Effect[] = [{ type: "snapshot" }];
      if (command.ready) effects.push(...maybeAdvance(next, ctx));
      return { room: next, effects };
    }

    case "round:timeout": {
      if (next.phase !== "playing") return { room, effects: [] };
      // A timer armed for an earlier round must not end this one. Rounds can
      // end early when everyone readies up, and a stale timer could otherwise
      // cut the following round short.
      if (command.round !== next.round) return { room, effects: [] };
      return { room: next, effects: advanceRound(next, ctx) };
    }

    case "reveal:update": {
      if (next.phase !== "results" || next.reveal.done) return { room, effects: [] };

      const current = next.reveal.activeSong;
      // Normally the song's own author drives its reveal, but control falls back
      // to the host and then to anyone present, so a departed presenter cannot
      // strand the results screen (see canControlReveal).
      const allowed = canControlReveal(
        next.reveal,
        next.players,
        next.hostId,
        next.melodies[current]?.seedPlayerId,
        command.playerId,
      );
      if (!allowed) return { room, effects: [] };

      if (command.activeSong === current) {
        const max = next.melodies[current]?.segments.length ?? 0;
        next.reveal = {
          activeSong: current,
          revealedLayers: Math.min(Math.max(0, Math.floor(command.revealedLayers)), max),
          playing: command.playing,
          done: false,
        };
      } else if (command.activeSong === current + 1) {
        const following = current + 1;
        next.reveal =
          following >= next.melodies.length
            ? { activeSong: current, revealedLayers: 0, playing: false, done: true }
            : { activeSong: following, revealedLayers: 0, playing: false, done: false };
      } else {
        return { room, effects: [] }; // out-of-order request
      }
      return { room: next, effects: [{ type: "snapshot" }] };
    }

    case "room:reap": {
      // Someone may have reconnected between the timer firing and this landing.
      if (next.players.some((p) => p.connected)) return { room, effects: [] };
      return { room: next, effects: [{ type: "destroy" }] };
    }
  }
}
