import { create } from "zustand";
import type {
  ClientMessage,
  GameConfig,
  Melody,
  Note,
  RoomSnapshot,
  ServerMessage,
  Timbre,
} from "@musicphone/shared";
import { wsUrl } from "@/lib/eden";

/**
 * Single source of client state. Owns the WebSocket (kept outside React state
 * to avoid re-render churn) and exposes typed actions that send ClientMessages.
 */

interface GameState {
  snapshot: RoomSnapshot | null;
  /** Read-only last measure handed to the local player this round. */
  contextNotes: Note[];
  /** Finished melodies, populated on game:finished. */
  finishedMelodies: Melody[];
  /** Local, editable notes for the current turn. */
  draft: Note[];
  selectedTimbre: Timbre;
  connected: boolean;
  error: string | null;
  /** Increments on each round:started — drives the countdown overlay. */
  roundCue: number;

  connect: (code: string, playerId: string) => void;
  disconnect: () => void;

  setDraft: (notes: Note[]) => void;
  clearDraft: () => void;
  setTimbre: (timbre: Timbre) => void;

  startGame: () => void;
  updateConfig: (patch: Partial<GameConfig>) => void;
  setReady: (ready: boolean) => void;
  submitTurn: () => void;
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
  contextNotes: [],
  finishedMelodies: [],
  draft: [],
  selectedTimbre: "sine",
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
    set({ snapshot: null, connected: false, draft: [], contextNotes: [], finishedMelodies: [] });
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

  setTimbre: (timbre) => set({ selectedTimbre: timbre }),

  startGame: () => send({ type: "game:start" }),
  updateConfig: (config) => send({ type: "config:update", config }),
  setReady: (ready) => send({ type: "player:ready", ready }),
  submitTurn: () => {
    send({ type: "turn:submit", notes: get().draft });
    send({ type: "player:ready", ready: true });
  },
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
      // A new turn begins: load the read-only context, clear local work, and
      // bump the cue so the countdown overlay fires.
      set((s) => ({ contextNotes: msg.contextNotes, draft: [], roundCue: s.roundCue + 1 }));
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
