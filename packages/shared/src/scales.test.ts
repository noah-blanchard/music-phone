import { describe, expect, it } from "vitest";
import {
  NOTE_NAMES,
  SCALE_INTERVALS,
  buildChromaticWindow,
  isBlackKey,
  midiToToneNote,
  noteLabel,
} from "./scales";

describe("SCALE_INTERVALS", () => {
  it("describes each scale as ascending semitone offsets from the root", () => {
    for (const [name, intervals] of Object.entries(SCALE_INTERVALS)) {
      expect(intervals[0], `${name} must start on the root`).toBe(0);
      expect(
        intervals.every((n) => n >= 0 && n < 12),
        `${name} must stay inside one octave`,
      ).toBe(true);
      const ascending = intervals.every((n, i) => i === 0 || n > intervals[i - 1]!);
      expect(ascending, `${name} must be ascending`).toBe(true);
      expect(new Set(intervals).size, `${name} must not repeat a pitch class`).toBe(
        intervals.length,
      );
    }
  });

  it("has the expected sizes", () => {
    expect(SCALE_INTERVALS.major).toHaveLength(7);
    expect(SCALE_INTERVALS.minor).toHaveLength(7);
    expect(SCALE_INTERVALS.pentatonic).toHaveLength(5);
  });
});

describe("noteLabel", () => {
  it("labels middle C as C4 (MIDI 60)", () => {
    expect(noteLabel(60)).toBe("C4");
  });

  it.each([
    [36, "C2"],
    [48, "C3"],
    [61, "C#4"],
    [71, "B4"],
    [72, "C5"],
    [96, "C7"],
  ])("labels MIDI %i as %s", (pitch, label) => {
    expect(noteLabel(pitch)).toBe(label);
  });

  it("handles pitch 0 and negative pitches without wrapping incorrectly", () => {
    expect(noteLabel(0)).toBe("C-1");
    // -1 is one semitone below C-1, i.e. B-2.
    expect(noteLabel(-1)).toBe("B-2");
  });

  it("assigns every pitch class a name", () => {
    for (let p = 60; p < 72; p++) {
      expect(noteLabel(p).replace(/-?\d+$/, "")).toBe(NOTE_NAMES[p % 12]);
    }
  });
});

describe("midiToToneNote", () => {
  it("matches noteLabel — Tone.js consumes the same scientific-pitch format", () => {
    for (let p = 0; p <= 127; p++) {
      expect(midiToToneNote(p)).toBe(noteLabel(p));
    }
  });
});

describe("isBlackKey", () => {
  it("identifies the five accidentals in each octave", () => {
    const black = [1, 3, 6, 8, 10];
    for (let p = 60; p < 72; p++) {
      expect(isBlackKey(p)).toBe(black.includes(p % 12));
    }
  });

  it("is octave-invariant, including below zero", () => {
    for (let pc = 0; pc < 12; pc++) {
      const expected = isBlackKey(60 + pc);
      expect(isBlackKey(pc)).toBe(expected);
      expect(isBlackKey(120 + pc)).toBe(expected);
      expect(isBlackKey(pc - 12)).toBe(expected);
    }
  });
});

describe("buildChromaticWindow", () => {
  it("is inclusive at both ends — one octave yields 13 pitches", () => {
    expect(buildChromaticWindow(60, 1)).toEqual([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
    ]);
  });

  it("returns a single pitch for a zero-octave window", () => {
    expect(buildChromaticWindow(60, 0)).toEqual([60]);
  });

  it("spans octaves * 12 + 1 pitches, ascending by one semitone", () => {
    for (const octaves of [1, 2, 5]) {
      const window = buildChromaticWindow(36, octaves);
      expect(window).toHaveLength(octaves * 12 + 1);
      expect(window[0]).toBe(36);
      expect(window.at(-1)).toBe(36 + octaves * 12);
      expect(window.every((p, i) => i === 0 || p === window[i - 1]! + 1)).toBe(true);
    }
  });

  it("returns a fresh array each call, so callers may mutate it", () => {
    const a = buildChromaticWindow(60, 1);
    const b = buildChromaticWindow(60, 1);
    expect(a).not.toBe(b);
    a.reverse();
    expect(b[0]).toBe(60);
  });
});
