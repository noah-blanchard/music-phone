import { describe, expect, it } from "vitest";
import { LAYER_ROLES, MAX_DRUM_VOICES, assignWheel, getRole, layersMode, rotate } from "./layers";
import {
  DEFAULT_CONFIG,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PIANO_MAX,
  PIANO_MIN,
  loopSteps,
  type GameConfig,
  type Melody,
  type Note,
  type Segment,
} from "../types";

const config: GameConfig = { ...DEFAULT_CONFIG };
const STEPS = loopSteps(config); // 16 steps/measure * 4 bars = 64

const pitchedRole = getRole("bass")!;
const drumRole = getRole("drums")!;

describe("role table", () => {
  it("exposes exactly one drum-grid role; the rest are piano-roll", () => {
    const drums = LAYER_ROLES.filter((r) => r.editor === "drum-grid");
    expect(drums).toHaveLength(1);
    expect(drums[0]!.id).toBe("drums");
  });

  it("has unique role ids and at least MAX_PLAYERS of them", () => {
    const ids = LAYER_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The host must be able to field one distinct role per player at full capacity.
    expect(ids.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
  });

  it("gives every role at least one candidate sound", () => {
    for (const role of LAYER_ROLES) {
      expect(role.instruments.length, `${role.id} needs a default sound`).toBeGreaterThan(0);
    }
  });

  it("resolves known ids and returns undefined for unknown ones", () => {
    expect(getRole("drums")).toBe(LAYER_ROLES[0]);
    expect(getRole("nope")).toBeUndefined();
    expect(getRole(undefined)).toBeUndefined();
  });
});

describe("rotate", () => {
  it("is the identity in round 0 — everyone seeds their own song", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let i = 0; i < n; i++) expect(rotate(i, 0, n)).toBe(i);
    }
  });

  it("is a bijection in every round: no two players share a song", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let round = 0; round < n; round++) {
        const songs = Array.from({ length: n }, (_, i) => rotate(i, round, n));
        expect(new Set(songs).size, `n=${n} round=${round}`).toBe(n);
      }
    }
  });

  it("is a derangement in rounds 1..n-1: nobody revisits their own song", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let round = 1; round < n; round++) {
        for (let i = 0; i < n; i++) {
          expect(rotate(i, round, n), `n=${n} round=${round} player=${i}`).not.toBe(i);
        }
      }
    }
  });

  it("has every player visit every song exactly once across n rounds", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let i = 0; i < n; i++) {
        const visited = Array.from({ length: n }, (_, round) => rotate(i, round, n));
        expect(new Set(visited).size, `n=${n} player=${i}`).toBe(n);
      }
    }
  });
});

describe("assignWheel", () => {
  /**
   * `startGame` re-rolls the wheel offset up to 24 times looking for an offset
   * that deals every player a distinct section, then falls back to a modulo
   * assignment. This sweep establishes how much work that retry actually does:
   * distinctness holds at every non-zero offset, so the retry is a guard
   * against one degenerate case rather than a routine occurrence.
   */
  it("deals every player a distinct section at every non-zero offset when roleCount >= playerCount", () => {
    const failures: string[] = [];
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let m = n; m <= LAYER_ROLES.length; m++) {
        // 1..719: step 0 and step 720 are the same boundary-aligned offset,
        // covered by the degenerate case below.
        for (let step = 1; step < 720; step++) {
          const offset = (step * 360) / 720;
          const sections = assignWheel(n, m, offset);
          if (new Set(sections).size !== n) failures.push(`n=${n} m=${m} offset=${offset}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The one degenerate input, and the reason startGame re-rolls. At offset 0
   * with n === m every avatar sits exactly on a section boundary, so the
   * assignment depends on how `Math.round` breaks a .5 tie — and floating-point
   * error in `(avatarDeg - sectionDeg / 2) / sectionDeg` makes that tie fall the
   * wrong way for n = 7. startGame draws its offset from Math.random() * 360, so
   * this is unreachable in practice; the retry covers it if it ever is.
   */
  it("collides only at offset 0 with 7 players and 7 roles — the case the re-roll exists for", () => {
    expect(new Set(assignWheel(7, 7, 0)).size).toBeLessThan(7);
    // A full turn is the same boundary alignment.
    expect(new Set(assignWheel(7, 7, 360)).size).toBeLessThan(7);

    // Every other exact-zero-offset combination is fine.
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let m = n; m <= LAYER_ROLES.length; m++) {
        if (n === 7 && m === 7) continue;
        expect(new Set(assignWheel(n, m, 0)).size, `n=${n} m=${m} offset=0`).toBe(n);
      }
    }
  });

  it("converges immediately for random offsets, so the 24-try re-roll always terminates", () => {
    // Deterministic pseudo-random sweep standing in for Math.random() * 360.
    let seed = 0x2f6e2b1;
    const nextOffset = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return (seed / 0x7fffffff) * 360;
    };
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let m = n; m <= LAYER_ROLES.length; m++) {
        for (let trial = 0; trial < 500; trial++) {
          expect(new Set(assignWheel(n, m, nextOffset())).size, `n=${n} m=${m}`).toBe(n);
        }
      }
    }
  });

  it("returns one section index per player, always within range", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let m = n; m <= LAYER_ROLES.length; m++) {
        const sections = assignWheel(n, m, 137.5);
        expect(sections).toHaveLength(n);
        for (const s of sections) {
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(m);
        }
      }
    }
  });

  it("stays in range for offsets outside 0..360", () => {
    for (const offset of [-720, -37.5, 360, 1080]) {
      for (const s of assignWheel(6, 8, offset)) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(8);
      }
    }
  });

  it("rotates the whole assignment by one section when the offset advances one section", () => {
    const m = 8;
    const sectionDeg = 360 / m;
    const before = assignWheel(4, m, 10);
    const after = assignWheel(4, m, 10 + sectionDeg);
    expect(after).toEqual(before.map((s) => (s - 1 + m) % m));
  });
});

describe("layersMode.totalRounds", () => {
  it("runs one round per player, so every song gains one layer per player", () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(layersMode.totalRounds(n, config)).toBe(n);
    }
  });
});

describe("layersMode.validateTurn — pitched roles", () => {
  const validate = (notes: unknown) => layersMode.validateTurn(notes, config, pitchedRole);

  it("keeps a well-formed note", () => {
    expect(validate([{ pitch: 60, start: 0, length: 4 }])).toEqual([
      { pitch: 60, start: 0, length: 4 },
    ]);
  });

  it("strips unknown properties, keeping only pitch/start/length", () => {
    const dirty = [{ pitch: 60, start: 0, length: 1, velocity: 127, evil: "<script>" }];
    expect(validate(dirty)).toEqual([{ pitch: 60, start: 0, length: 1 }]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", {}],
    ["a string", "notes"],
  ])("returns an empty array for %s", (_label, notes) => {
    expect(validate(notes)).toEqual([]);
  });

  it("accepts the inclusive pitch bounds", () => {
    expect(validate([{ pitch: PIANO_MIN, start: 0, length: 1 }])).toHaveLength(1);
    expect(validate([{ pitch: PIANO_MAX, start: 0, length: 1 }])).toHaveLength(1);
  });

  it.each([PIANO_MIN - 1, PIANO_MAX + 1, -1, 500])("drops out-of-range pitch %i", (pitch) => {
    expect(validate([{ pitch, start: 0, length: 1 }])).toEqual([]);
  });

  it("accepts a note ending exactly on the last step", () => {
    expect(validate([{ pitch: 60, start: STEPS - 1, length: 1 }])).toHaveLength(1);
    expect(validate([{ pitch: 60, start: 0, length: STEPS }])).toHaveLength(1);
  });

  it("drops a note that would run past the end of the loop", () => {
    expect(validate([{ pitch: 60, start: STEPS - 1, length: 2 }])).toEqual([]);
    expect(validate([{ pitch: 60, start: 0, length: STEPS + 1 }])).toEqual([]);
  });

  it.each([-1, STEPS, STEPS + 100])("drops out-of-range start %i", (start) => {
    expect(validate([{ pitch: 60, start, length: 1 }])).toEqual([]);
  });

  it.each([0, -1])("drops non-positive length %i", (length) => {
    expect(validate([{ pitch: 60, start: 0, length }])).toEqual([]);
  });

  it.each([
    ["a fractional pitch", { pitch: 60.5, start: 0, length: 1 }],
    ["a fractional start", { pitch: 60, start: 0.5, length: 1 }],
    ["a fractional length", { pitch: 60, start: 0, length: 1.5 }],
    ["NaN", { pitch: NaN, start: 0, length: 1 }],
    ["Infinity", { pitch: Infinity, start: 0, length: 1 }],
    ["a string pitch", { pitch: "60", start: 0, length: 1 }],
    ["a missing length", { pitch: 60, start: 0 }],
    ["a null entry", null],
    ["an array entry", [60, 0, 1]],
  ])("drops %s", (_label, note) => {
    expect(validate([note])).toEqual([]);
  });

  it("keeps the valid notes and drops only the invalid ones", () => {
    const mixed = [
      { pitch: 60, start: 0, length: 1 },
      { pitch: 9999, start: 0, length: 1 },
      { pitch: 62, start: 4, length: 2 },
    ];
    expect(validate(mixed)).toEqual([
      { pitch: 60, start: 0, length: 1 },
      { pitch: 62, start: 4, length: 2 },
    ]);
  });

  it("caps the payload at 512 notes so one client cannot flood a room", () => {
    const many = Array.from({ length: 600 }, () => ({ pitch: 60, start: 0, length: 1 }));
    expect(validate(many)).toHaveLength(512);
  });

  it("respects out-of-scale pitches — scale lock is a client-side editing aid", () => {
    // C# against a C-rooted scale must still survive server validation.
    expect(validate([{ pitch: 61, start: 0, length: 1 }])).toHaveLength(1);
  });

  it("adapts its step bound to the configured loop length", () => {
    const short: GameConfig = { ...config, barsPerSong: 2 };
    const shortSteps = loopSteps(short); // 32
    expect(
      layersMode.validateTurn([{ pitch: 60, start: 31, length: 1 }], short, pitchedRole),
    ).toHaveLength(1);
    expect(
      layersMode.validateTurn([{ pitch: 60, start: shortSteps, length: 1 }], short, pitchedRole),
    ).toEqual([]);
  });
});

describe("layersMode.validateTurn — drum roles", () => {
  const validate = (notes: unknown) => layersMode.validateTurn(notes, config, drumRole);

  it("normalises every hit to length 1 regardless of the submitted length", () => {
    expect(validate([{ pitch: 0, start: 0, length: 99 }])).toEqual([
      { pitch: 0, start: 0, length: 1 },
    ]);
  });

  it("does not require a length at all", () => {
    expect(validate([{ pitch: 2, start: 8 }])).toEqual([{ pitch: 2, start: 8, length: 1 }]);
  });

  it("treats pitch as a lane index bounded by MAX_DRUM_VOICES", () => {
    expect(validate([{ pitch: 0, start: 0 }])).toHaveLength(1);
    expect(validate([{ pitch: MAX_DRUM_VOICES - 1, start: 0 }])).toHaveLength(1);
    expect(validate([{ pitch: MAX_DRUM_VOICES, start: 0 }])).toEqual([]);
    expect(validate([{ pitch: -1, start: 0 }])).toEqual([]);
  });

  it.each([-1, STEPS, STEPS + 1])("drops out-of-range start %i", (start) => {
    expect(validate([{ pitch: 0, start }])).toEqual([]);
  });

  it("caps the payload at 512 hits", () => {
    const many = Array.from({ length: 600 }, () => ({ pitch: 0, start: 0 }));
    expect(validate(many)).toHaveLength(512);
  });

  it("returns an empty array for a non-array payload", () => {
    expect(validate("boom")).toEqual([]);
  });
});

describe("layersMode.buildContext", () => {
  const segment = (order: number, roleId: string, notes: Note[] = []): Segment => ({
    authorId: `p${order}`,
    authorName: `Player ${order}`,
    order,
    roleId,
    instrumentId: `${roleId}-sound`,
    notes,
  });

  const song: Melody = {
    id: "song-1",
    seedPlayerId: "p0",
    bpm: 120,
    root: 60,
    scale: "major",
    segments: [
      segment(0, "drums", [{ pitch: 0, start: 0, length: 1 }]),
      segment(1, "bass", [{ pitch: 40, start: 0, length: 4 }]),
    ],
  };

  it("returns every layer when visibility is 'all'", () => {
    const layers = layersMode.buildContext(song, 2, { ...config, contextVisibility: "all" });
    expect(layers.map((l) => l.roleId)).toEqual(["drums", "bass"]);
  });

  it("returns only the most recent layer when visibility is 'previous'", () => {
    const layers = layersMode.buildContext(song, 2, { ...config, contextVisibility: "previous" });
    expect(layers).toHaveLength(1);
    expect(layers[0]!.roleId).toBe("bass");
  });

  it("returns nothing when visibility is 'blind'", () => {
    expect(layersMode.buildContext(song, 2, { ...config, contextVisibility: "blind" })).toEqual([]);
  });

  it("returns nothing for an empty song regardless of visibility", () => {
    const empty: Melody = { ...song, segments: [] };
    for (const contextVisibility of ["all", "previous", "blind"] as const) {
      expect(layersMode.buildContext(empty, 0, { ...config, contextVisibility })).toEqual([]);
    }
  });

  it("carries the chosen instrument through so context plays back as authored", () => {
    const layers = layersMode.buildContext(song, 2, { ...config, contextVisibility: "all" });
    expect(layers.map((l) => l.instrumentId)).toEqual(["drums-sound", "bass-sound"]);
  });

  it("exposes notes but never author identity — context must stay anonymous", () => {
    const layers = layersMode.buildContext(song, 2, { ...config, contextVisibility: "all" });
    for (const layer of layers) {
      expect(Object.keys(layer).sort()).toEqual(["instrumentId", "notes", "roleId"]);
    }
  });
});
