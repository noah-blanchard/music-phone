type Listener = (step: number | null) => void;

/**
 * A tiny publish/subscribe channel for the transport's current step.
 *
 * The step used to live in React state on the play view, so every 16th note
 * re-rendered both editors — roughly 190 grid nodes each, nine times a second
 * at 140 BPM, while the player was trying to draw. Nothing about the grid
 * actually changes as the playhead moves, so the step is kept out of React
 * entirely and the editors move one absolutely-positioned element themselves.
 */
export interface Playhead {
  /** Publish the current step, or null when playback stops. */
  set: (step: number | null) => void;
  /** Subscribe; the listener is called immediately with the current step. */
  subscribe: (listener: Listener) => () => void;
}

export function createPlayhead(): Playhead {
  const listeners = new Set<Listener>();
  let step: number | null = null;
  let frame = 0;

  const flush = () => {
    frame = 0;
    for (const listener of listeners) listener(step);
  };

  return {
    set(next) {
      if (next === step) return;
      step = next;
      // Coalesce to one write per frame: Tone can schedule several steps in a
      // burst after the audio thread catches up, and only the last one is worth
      // drawing.
      if (typeof requestAnimationFrame !== "function") {
        flush();
        return;
      }
      if (frame === 0) frame = requestAnimationFrame(flush);
    },

    subscribe(listener) {
      listeners.add(listener);
      listener(step);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
