import { create } from "zustand";
import type {
  ClientMessage,
  GameConfig,
  Layer,
  Melody,
  Note,
  Role,
  RoomSnapshot,
  ScaleType,
  ServerMessage,
} from "@musicphone/shared";
import { wsUrl } from "@/lib/eden";
import { MAX_RETRIES, retryDelay } from "@/lib/retry";

/** Per-song musical params handed to the local player this round. */
export interface SongParams {
  bpm: number;
  root: number;
  scale: ScaleType;
}

/** How the socket is currently doing, for the connection indicator. */
export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "ended";

/**
 * Errors that make retrying pointless: the room is gone, this player is not in
 * it, or the origin is refused. Reconnecting cannot fix any of them.
 */
const FATAL_ERROR_CODES = new Set(["join_failed", "forbidden_origin"]);

/**
 * Single source of client state. Owns the WebSocket (kept outside React state
 * to avoid re-render churn) and exposes typed actions that send ClientMessages.
 */
interface GameState {
  snapshot: RoomSnapshot | null;
  /** Read-only prior layers handed to the local player. */
  contextLayers: Layer[];
  /** The role to fill this round. */
  currentRole: Role | null;
  /** The assigned song's musical params this round. */
  currentSong: SongParams | null;
  /** Whether this round's song is empty (round 0 → slot machine). */
  isFirstLayer: boolean;
  /** The sound the server rolled for this layer. */
  selectedInstrument: string;
  /** Re-rolls of that sound left this round, as the server counts them. */
  rerollsLeft: number;
  /** Whether the local player unlocked out-of-scale placement this round. */
  pitchUnlocked: boolean;
  /** Local, editable notes for the current turn. */
  draft: Note[];
  /** Finished songs, populated on game:finished. */
  finishedMelodies: Melody[];
  status: ConnectionStatus;
  connected: boolean;
  error: string | null;
  /** Increments on each genuinely new round — drives the intro overlay. */
  roundCue: number;

  connect: (code: string, playerId: string) => void;
  disconnect: () => void;

  setDraft: (notes: Note[]) => void;
  clearDraft: () => void;
  /** Ask the server for a different sound (limited per round). */
  rerollInstrument: () => void;
  setPitchUnlocked: (unlocked: boolean) => void;
  dismissError: () => void;

  startGame: () => void;
  updateConfig: (patch: Partial<GameConfig>) => void;
  setReady: (ready: boolean) => void;
  submitTurn: () => void;
  /** Drive the room-wide guided reveal (whoever the server puts in charge). */
  setReveal: (activeSong: number, revealedLayers: number, playing: boolean) => void;
}

let socket: WebSocket | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let intentionalClose = false;
let reconnectArgs: { code: string; playerId: string } | null = null;

function send(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

export const useGameStore = create<GameState>((set, get) => ({
  snapshot: null,
  contextLayers: [],
  currentRole: null,
  currentSong: null,
  isFirstLayer: false,
  selectedInstrument: "",
  rerollsLeft: 0,
  pitchUnlocked: false,
  draft: [],
  finishedMelodies: [],
  status: "connecting",
  connected: false,
  error: null,
  roundCue: 0,

  connect: (code, playerId) => {
    intentionalClose = false;
    reconnectArgs = { code, playerId };
    clearRetry();
    if (socket) socket.close();

    const ws = new WebSocket(
      `${wsUrl()}/ws?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`,
    );
    socket = ws;

    // Guard every handler with `socket === ws`: in React StrictMode the effect
    // mounts twice, so a stale socket can emit events after it has been
    // replaced. Only the currently active socket may touch state or reconnect.
    ws.onopen = () => {
      if (socket !== ws) return;
      retryAttempt = 0;
      set({ connected: true, status: "online", error: null });
    };

    ws.onclose = () => {
      if (socket !== ws) return;
      set({ connected: false });
      if (intentionalClose || !reconnectArgs) return;

      if (retryAttempt >= MAX_RETRIES) {
        set({ status: "ended", error: "Lost contact with the server. Reload to rejoin." });
        return;
      }

      const args = reconnectArgs;
      const delay = retryDelay(retryAttempt);
      retryAttempt += 1;
      set({ status: "reconnecting" });
      retryTimer = setTimeout(() => {
        if (socket === ws && reconnectArgs) get().connect(args.code, args.playerId);
      }, delay);
    };

    ws.onmessage = (event) => {
      if (socket !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      dispatch(msg, set);
    };
  },

  // Transient teardown used by effect cleanup (page reload, StrictMode remount,
  // navigation). It must NOT announce a leave — the server treats a closed
  // socket as transient and only removes a lobby player after a grace window
  // that a quick reconnect cancels. An explicit "leave room" action would send
  // { type: "room:leave" } instead.
  disconnect: () => {
    intentionalClose = true;
    reconnectArgs = null;
    retryAttempt = 0;
    clearRetry();
    socket?.close();
    socket = null;
    set({
      snapshot: null,
      connected: false,
      status: "connecting",
      draft: [],
      contextLayers: [],
      currentRole: null,
      currentSong: null,
      finishedMelodies: [],
    });
  },

  setDraft: (notes) => {
    set({ draft: notes });
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => send({ type: "turn:autosave", notes: get().draft }), 600);
  },

  clearDraft: () => {
    set({ draft: [] });
    send({ type: "turn:autosave", notes: [] });
  },

  // The server owns both the sound and the re-roll budget, so this only asks;
  // the answer comes back as turn:state.
  rerollInstrument: () => send({ type: "turn:reroll" }),

  setPitchUnlocked: (pitchUnlocked) => set({ pitchUnlocked }),
  dismissError: () => set({ error: null }),

  startGame: () => send({ type: "game:start" }),
  updateConfig: (config) => send({ type: "config:update", config }),
  setReady: (ready) => send({ type: "player:ready", ready }),
  submitTurn: () => {
    send({ type: "turn:submit", notes: get().draft });
    send({ type: "player:ready", ready: true });
  },
  setReveal: (activeSong, revealedLayers, playing) =>
    send({ type: "reveal:update", activeSong, revealedLayers, playing }),
}));

function dispatch(
  msg: ServerMessage,
  set: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void,
): void {
  switch (msg.type) {
    case "room:snapshot":
      set({ snapshot: msg.room });
      if (msg.room.phase === "results") set({ finishedMelodies: msg.room.melodies });
      break;

    case "round:started":
      set((s) => ({
        contextLayers: msg.contextLayers,
        currentRole: msg.role,
        currentSong: msg.song,
        isFirstLayer: msg.isFirstLayer,
        selectedInstrument: msg.instrumentId,
        rerollsLeft: msg.rerollsLeft,
        // The server hands back whatever it last autosaved for this player, so
        // a dropped connection costs them nothing.
        draft: msg.draft,
        // Only a genuinely new round resets the editing aids and replays the
        // intro. Resuming must not blank someone's work, nor make them sit
        // through the wheel and countdown a second time.
        pitchUnlocked: msg.resumed ? s.pitchUnlocked : false,
        roundCue: msg.resumed ? s.roundCue : s.roundCue + 1,
      }));
      break;

    case "turn:state":
      set({ selectedInstrument: msg.instrumentId, rerollsLeft: msg.rerollsLeft });
      break;

    case "round:ended":
      break;

    case "game:finished":
      set({ finishedMelodies: msg.melodies });
      break;

    case "error":
      // A fatal error means retrying cannot help; stop and say so plainly.
      if (FATAL_ERROR_CODES.has(msg.code)) {
        intentionalClose = true;
        reconnectArgs = null;
        clearRetry();
        set({ status: "ended", error: msg.message });
      } else {
        set({ error: msg.message });
      }
      break;
  }
}
