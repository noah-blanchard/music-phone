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
import { roleDefaultSound } from "@musicphone/shared";
import { wsUrl } from "@/lib/eden";

/** Per-song musical params handed to the local player this round. */
export interface SongParams {
  bpm: number;
  root: number;
  scale: ScaleType;
}

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
  /** Chosen sound id (instrument or kit) for the current layer. */
  selectedInstrument: string;
  /** Whether the local player unlocked out-of-scale placement this round. */
  pitchUnlocked: boolean;
  /** Whether the local player has submitted the current round. */
  submitted: boolean;
  /** Finished songs, populated on game:finished. */
  finishedMelodies: Melody[];
  /** Local, editable notes for the current turn. */
  draft: Note[];
  connected: boolean;
  error: string | null;
  /** Increments on each round:started — drives the countdown overlay. */
  roundCue: number;

  connect: (code: string, playerId: string) => void;
  disconnect: () => void;

  setDraft: (notes: Note[]) => void;
  clearDraft: () => void;
  setInstrument: (instrumentId: string) => void;
  setPitchUnlocked: (unlocked: boolean) => void;

  startGame: () => void;
  updateConfig: (patch: Partial<GameConfig>) => void;
  setReady: (ready: boolean) => void;
  submitTurn: () => void;
  /** Drive the room-wide guided reveal (active song's author only). */
  setReveal: (activeSong: number, revealedLayers: number, playing: boolean) => void;
}

let socket: WebSocket | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let intentionalClose = false;
let reconnectArgs: { code: string; playerId: string } | null = null;

function send(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

export const useGameStore = create<GameState>((set, get) => ({
  snapshot: null,
  contextLayers: [],
  currentRole: null,
  currentSong: null,
  isFirstLayer: false,
  selectedInstrument: "",
  pitchUnlocked: false,
  submitted: false,
  finishedMelodies: [],
  draft: [],
  connected: false,
  error: null,
  roundCue: 0,

  connect: (code, playerId) => {
    intentionalClose = false;
    reconnectArgs = { code, playerId };
    if (socket) socket.close();

    const ws = new WebSocket(`${wsUrl()}/ws?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`);
    socket = ws;

    // Guard every handler with `socket === ws`: in React StrictMode the effect
    // mounts twice, so a stale socket can emit events after it has been replaced.
    // Only the currently active socket is allowed to mutate state or reconnect.
    ws.onopen = () => {
      if (socket === ws) set({ connected: true, error: null });
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      set({ connected: false });
      if (!intentionalClose && reconnectArgs) {
        const args = reconnectArgs;
        setTimeout(() => {
          if (socket === ws && reconnectArgs) get().connect(args.code, args.playerId);
        }, 1500);
      }
    };
    ws.onmessage = (event) => {
      if (socket !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      dispatch(msg, set, get);
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
    socket?.close();
    socket = null;
    set({
      snapshot: null,
      connected: false,
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
    autosaveTimer = setTimeout(
      () => send({ type: "turn:autosave", notes: get().draft, instrumentId: get().selectedInstrument }),
      600,
    );
  },

  clearDraft: () => {
    set({ draft: [] });
    send({ type: "turn:autosave", notes: [], instrumentId: get().selectedInstrument });
  },

  setInstrument: (instrumentId) => {
    set({ selectedInstrument: instrumentId });
    // Persist the choice even if the draft isn't edited again before submit.
    send({ type: "turn:autosave", notes: get().draft, instrumentId });
  },
  setPitchUnlocked: (pitchUnlocked) => set({ pitchUnlocked }),

  startGame: () => send({ type: "game:start" }),
  updateConfig: (config) => send({ type: "config:update", config }),
  setReady: (ready) => send({ type: "player:ready", ready }),
  submitTurn: () => {
    send({ type: "turn:submit", notes: get().draft, instrumentId: get().selectedInstrument });
    send({ type: "player:ready", ready: true });
    set({ submitted: true });
  },
  setReveal: (activeSong, revealedLayers, playing) =>
    send({ type: "reveal:update", activeSong, revealedLayers, playing }),
}));

function dispatch(
  msg: ServerMessage,
  set: (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void,
  get: () => GameState,
): void {
  switch (msg.type) {
    case "room:snapshot":
      set({ snapshot: msg.room });
      if (msg.room.phase === "results") set({ finishedMelodies: msg.room.melodies });
      break;
    case "round:started":
      // A new turn begins: load the read-only context, clear local work, reset
      // per-round UI state, and bump the cue so the countdown overlay fires.
      set((s) => ({
        contextLayers: msg.contextLayers,
        currentRole: msg.role,
        currentSong: msg.song,
        isFirstLayer: msg.isFirstLayer,
        selectedInstrument: roleDefaultSound(msg.role),
        pitchUnlocked: false,
        submitted: false,
        draft: [],
        roundCue: s.roundCue + 1,
      }));
      break;
    case "round:ended":
      break;
    case "game:finished":
      set({ finishedMelodies: msg.melodies });
      break;
    case "error":
      set({ error: msg.message });
      break;
  }
  void get;
}
