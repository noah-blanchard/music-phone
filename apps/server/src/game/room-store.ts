import {
  BPM_CHOICES,
  DEFAULT_CONFIG,
  KEY_CHOICES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SCALE_CHOICES,
  assignWheel,
  getMode,
  getRole,
  sanitizeConfig,
  type GameConfig,
  type Melody,
  type Note,
  type Player,
  type Role,
  type Room,
  type ScaleType,
  type ServerMessage,
} from "@musicphone/shared";
import { toSnapshot } from "./serialize";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

type Sender = (msg: ServerMessage) => void;

/** Per-room runtime state that is intentionally NOT part of the serializable Room. */
interface RoomRuntime {
  sockets: Map<string, Sender>;
  /** Notes a player intends to commit this round (set on submit). */
  pending: Map<string, Note[]>;
  /** Latest autosaved draft per player (fallback when a round times out). */
  drafts: Map<string, Note[]>;
  /** Latest chosen sound id (instrument/kit) per player for the current round. */
  instruments: Map<string, string>;
  timer: ReturnType<typeof setTimeout> | null;
  /** Cleanup timer started when a room becomes empty. */
  reaper: ReturnType<typeof setTimeout> | null;
  /** Grace timers per player: a lobby socket close removes the player only if it
   *  is not cancelled by a reconnect within the grace window. */
  leaveTimers: Map<string, ReturnType<typeof setTimeout>>;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
const EMPTY_ROOM_TTL_MS = 60_000;
/** Grace window before a lobby player who closed their socket is removed. A
 *  reconnect within this window (e.g. StrictMode remount) cancels removal. */
const LEAVE_GRACE_MS = 5_000;

function randomCode(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function randomId(): string {
  return crypto.randomUUID();
}

export interface CreateResult {
  room: Room;
  playerId: string;
}

/**
 * Owns all rooms in memory plus their live socket connections and timers.
 * A single instance is shared by the Elysia app.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private runtimes = new Map<string, RoomRuntime>();

  /* ------------------------------- Lifecycle ------------------------------ */

  create(hostName: string, config?: Partial<GameConfig>): CreateResult {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();

    const hostId = randomId();
    const host: Player = { id: hostId, name: cleanName(hostName), connected: false, isHost: true };
    const room: Room = {
      code,
      hostId,
      phase: "lobby",
      config: { ...DEFAULT_CONFIG, ...sanitizeConfig(config ?? {}, DEFAULT_CONFIG) },
      players: [host],
      round: 0,
      totalRounds: 0,
      melodies: [],
      roundEndsAt: 0,
      ready: {},
      assignments: {},
      wheelOffsetDeg: 0,
      reveal: { activeSong: 0, revealedLayers: 0, playing: false, done: false },
    };
    this.rooms.set(code, room);
    this.runtimes.set(code, {
      sockets: new Map(),
      pending: new Map(),
      drafts: new Map(),
      instruments: new Map(),
      timer: null,
      reaper: null,
      leaveTimers: new Map(),
    });
    return { room, playerId: hostId };
  }

  join(code: string, name: string): CreateResult | { error: string } {
    const room = this.rooms.get(code);
    if (!room) return { error: "Room not found" };
    if (room.phase !== "lobby") return { error: "Game already started" };
    if (room.players.length >= MAX_PLAYERS) return { error: "Room is full" };

    const playerId = randomId();
    room.players.push({ id: playerId, name: cleanName(name), connected: false, isHost: false });
    return { room, playerId };
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /* ----------------------------- Connections ------------------------------ */

  /** Attach a live socket for a player. Returns false if the player is unknown. */
  connect(code: string, playerId: string, send: Sender): boolean {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return false;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    if (rt.reaper) {
      clearTimeout(rt.reaper);
      rt.reaper = null;
    }
    // Cancel any pending grace removal — this player is back.
    const leaveTimer = rt.leaveTimers.get(playerId);
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      rt.leaveTimers.delete(playerId);
    }
    rt.sockets.set(playerId, send);
    player.connected = true;
    return true;
  }

  /**
   * A socket closed. This is transient (page reload, React StrictMode remount,
   * flaky network), so we never remove the player immediately. We mark them
   * disconnected and, in the lobby, schedule a grace removal that a quick
   * reconnect cancels. Mid-game the slot is always kept so the melody chain
   * stays intact.
   */
  handleClose(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;

    rt.sockets.delete(playerId);
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;

    if (room.phase === "lobby" && player) {
      if (rt.leaveTimers.has(playerId)) clearTimeout(rt.leaveTimers.get(playerId)!);
      rt.leaveTimers.set(
        playerId,
        setTimeout(() => this.leave(code, playerId), LEAVE_GRACE_MS),
      );
    }

    if (rt.sockets.size === 0) this.scheduleReap(code);
    else this.broadcastSnapshot(code);
  }

  /**
   * Explicit, immediate departure (room:leave, or grace expiry in the lobby).
   * In the lobby the player is fully removed and the host reassigned; mid-game
   * the slot is kept and the player just marked disconnected.
   */
  leave(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;

    rt.sockets.delete(playerId);
    const timer = rt.leaveTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      rt.leaveTimers.delete(playerId);
    }

    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length > 0 && playerId === room.hostId) {
        const next = room.players[0]!;
        next.isHost = true;
        room.hostId = next.id;
      }
    } else {
      const player = room.players.find((p) => p.id === playerId);
      if (player) player.connected = false;
    }

    if (rt.sockets.size === 0) this.scheduleReap(code);
    else this.broadcastSnapshot(code);
  }

  private scheduleReap(code: string): void {
    const rt = this.runtimes.get(code);
    if (!rt) return;
    if (rt.reaper) clearTimeout(rt.reaper);
    rt.reaper = setTimeout(() => this.destroy(code), EMPTY_ROOM_TTL_MS);
  }

  private destroy(code: string): void {
    const rt = this.runtimes.get(code);
    if (rt?.timer) clearTimeout(rt.timer);
    if (rt?.reaper) clearTimeout(rt.reaper);
    if (rt) for (const t of rt.leaveTimers.values()) clearTimeout(t);
    this.rooms.delete(code);
    this.runtimes.delete(code);
  }

  /* ------------------------------ Messaging ------------------------------- */

  send(code: string, playerId: string, msg: ServerMessage): void {
    this.runtimes.get(code)?.sockets.get(playerId)?.(msg);
  }

  broadcast(code: string, msg: ServerMessage): void {
    const rt = this.runtimes.get(code);
    if (!rt) return;
    for (const send of rt.sockets.values()) send(msg);
  }

  /**
   * Bring a freshly (re)connected player up to date: snapshot, plus the current
   * round context if a game is in progress, or the finished melodies if over.
   */
  sync(code: string, playerId: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;
    this.send(code, playerId, { type: "room:snapshot", room: toSnapshot(room, playerId) });

    if (room.phase === "playing") {
      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx >= 0) this.send(code, playerId, this.roundStartedMsg(room, idx));
    } else if (room.phase === "results") {
      this.send(code, playerId, { type: "game:finished", melodies: room.melodies });
    }
  }

  /** Send a fresh, per-player sanitized snapshot to everyone connected. */
  broadcastSnapshot(code: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;
    for (const [playerId, send] of rt.sockets) {
      send({ type: "room:snapshot", room: toSnapshot(room, playerId) });
    }
  }

  /* ------------------------------ Game flow ------------------------------- */

  startGame(code: string, playerId: string): string | null {
    const room = this.rooms.get(code);
    if (!room) return "Room not found";
    if (playerId !== room.hostId) return "Only the host can start the game";
    if (room.phase !== "lobby") return "Game already started";
    console.log(`Starting game in room ${code} hosted by ${playerId}, MIN_PLAYERS=${MIN_PLAYERS}, players=${room.players.length}`);
    if (room.players.length < MIN_PLAYERS) return `Need at least ${MIN_PLAYERS} players`;

    const mode = getMode(room.config.mode);
    const n = room.players.length;
    const roles = room.config.selectedRoles;
    if (roles.length < n) return `Select at least ${n} layer kinds (one per player)`;

    room.totalRounds = mode.totalRounds(n, room.config);
    // Each song rolls its own BPM / key / scale (revealed by the slot machine).
    room.melodies = room.players.map<Melody>((p) => ({
      id: randomId(),
      seedPlayerId: p.id,
      bpm: pick(BPM_CHOICES),
      root: pick(KEY_CHOICES),
      scale: pick(SCALE_CHOICES) as ScaleType,
      segments: [],
    }));

    // Wheel of fortune: spin to a random offset, assign each player a distinct
    // role from the selected set (re-roll on the rare boundary collision).
    let offsetDeg = 0;
    let sections: number[] = [];
    for (let tries = 0; tries < 24; tries++) {
      offsetDeg = Math.random() * 360;
      sections = assignWheel(n, roles.length, offsetDeg);
      if (new Set(sections).size === n) break;
    }
    room.wheelOffsetDeg = offsetDeg;
    room.assignments = {};
    room.players.forEach((p, i) => {
      room.assignments[p.id] = roles[sections[i]!] ?? roles[i % roles.length]!;
    });

    room.phase = "playing";
    room.round = 0;
    this.beginRound(code);
    return null;
  }

  /** The role a player was dealt by the wheel (falls back to the first role). */
  private roleOf(room: Room, playerId: string): Role {
    return getRole(room.assignments[playerId]) ?? getRole(room.config.selectedRoles[0])!;
  }

  /** Build the per-player `round:started` payload via the active game mode. */
  private roundStartedMsg(room: Room, playerIdx: number): ServerMessage {
    const mode = getMode(room.config.mode);
    const player = room.players[playerIdx]!;
    const songIdx = mode.assign(playerIdx, room.round, room.players.length);
    const song = room.melodies[songIdx]!;
    return {
      type: "round:started",
      round: room.round,
      contextLayers: mode.buildContext(song, room.round, room.config),
      role: this.roleOf(room, player.id),
      song: { bpm: song.bpm, root: song.root, scale: song.scale },
      isFirstLayer: song.segments.length === 0,
      endsAt: room.roundEndsAt,
    };
  }

  updateConfig(code: string, playerId: string, patch: Partial<GameConfig>): void {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "lobby" || playerId !== room.hostId) return;
    room.config = sanitizeConfig(patch, room.config);
    this.broadcastSnapshot(code);
  }

  /** Begin the current round: reset ready, set the timer, push contexts. */
  private beginRound(code: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;

    room.ready = {};
    rt.pending.clear();
    rt.drafts.clear();
    rt.instruments.clear();
    room.roundEndsAt = Date.now() + room.config.roundDurationSec * 1000;

    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = setTimeout(() => this.advanceRound(code), room.config.roundDurationSec * 1000);

    this.broadcastSnapshot(code);
    for (const [playerId, send] of rt.sockets) {
      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx < 0) continue;
      send(this.roundStartedMsg(room, idx));
    }
  }

  autosave(code: string, playerId: string, notes: unknown, instrumentId?: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt || room.phase !== "playing") return;
    const clean = getMode(room.config.mode).validateTurn(notes, room.config, this.roleOf(room, playerId));
    rt.drafts.set(playerId, clean);
    if (instrumentId) rt.instruments.set(playerId, instrumentId);
  }

  submit(code: string, playerId: string, notes: unknown, instrumentId?: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt || room.phase !== "playing") return;
    const clean = getMode(room.config.mode).validateTurn(notes, room.config, this.roleOf(room, playerId));
    rt.pending.set(playerId, clean);
    rt.drafts.set(playerId, clean);
    if (instrumentId) rt.instruments.set(playerId, instrumentId);
    room.ready[playerId] = true;
    this.broadcastSnapshot(code);
    this.maybeAdvance(code);
  }

  setReady(code: string, playerId: string, ready: boolean): void {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "playing") return;
    room.ready[playerId] = ready;
    this.broadcastSnapshot(code);
    if (ready) this.maybeAdvance(code);
  }

  /** Advance early once every connected player is ready. */
  private maybeAdvance(code: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt) return;
    const connected = room.players.filter((p) => rt.sockets.has(p.id));
    if (connected.length === 0) return;
    if (connected.every((p) => room.ready[p.id])) this.advanceRound(code);
  }

  /** Commit every player's segment for the current round and move on. */
  private advanceRound(code: string): void {
    const room = this.rooms.get(code);
    const rt = this.runtimes.get(code);
    if (!room || !rt || room.phase !== "playing") return;
    if (rt.timer) {
      clearTimeout(rt.timer);
      rt.timer = null;
    }

    const mode = getMode(room.config.mode);
    const n = room.players.length;
    room.players.forEach((player, idx) => {
      const notes = rt.pending.get(player.id) ?? rt.drafts.get(player.id) ?? [];
      const melody = room.melodies[mode.assign(idx, room.round, n)]!;
      melody.segments.push({
        authorId: player.id,
        authorName: player.name,
        order: room.round,
        roleId: this.roleOf(room, player.id).id,
        instrumentId: rt.instruments.get(player.id),
        notes,
      });
    });

    this.broadcast(code, { type: "round:ended", round: room.round });
    room.round += 1;

    if (room.round >= room.totalRounds) {
      room.phase = "results";
      // Start the room-wide guided reveal at the first song, nothing revealed.
      room.reveal = { activeSong: 0, revealedLayers: 0, playing: false, done: false };
      this.broadcast(code, { type: "game:finished", melodies: room.melodies });
      this.broadcastSnapshot(code);
    } else {
      this.beginRound(code);
    }
  }

  /**
   * Drive the single, room-wide guided reveal. Only the active song's seed player
   * (its author) may control it. Setting `activeSong` to the next index advances
   * to the next song (resetting its reveal) and hands control to that song's
   * author; advancing past the last song marks the reveal `done`.
   */
  setReveal(
    code: string,
    playerId: string,
    activeSong: number,
    revealedLayers: number,
    playing: boolean,
  ): void {
    const room = this.rooms.get(code);
    if (!room || room.phase !== "results" || room.reveal.done) return;

    const current = room.reveal.activeSong;
    const presenter = room.melodies[current]?.seedPlayerId;
    if (presenter !== playerId) return; // only the current song's author controls

    if (activeSong === current) {
      // Update the current song's reveal in place.
      const max = room.melodies[current]?.segments.length ?? 0;
      room.reveal = {
        activeSong: current,
        revealedLayers: Math.min(Math.max(0, Math.floor(revealedLayers)), max),
        playing,
        done: false,
      };
    } else if (activeSong === current + 1) {
      // Advance to the next song (or finish after the last).
      const next = current + 1;
      room.reveal =
        next >= room.melodies.length
          ? { activeSong: current, revealedLayers: 0, playing: false, done: true }
          : { activeSong: next, revealedLayers: 0, playing: false, done: false };
    } else {
      return; // out-of-order request, ignore
    }
    this.broadcastSnapshot(code);
  }
}

function cleanName(name: string): string {
  const trimmed = (name ?? "").trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : "Player";
}
