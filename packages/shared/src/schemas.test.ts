import { describe, expect, it } from "vitest";
import { parseClientMessage, sanitizeConfig } from "./schemas";
import { DEFAULT_CONFIG, type GameConfig } from "./types";
import { LAYER_ROLES } from "./modes/layers";

/**
 * `parseClientMessage` is the only thing standing between an untrusted socket
 * payload and the game reducer, so the rejection cases matter as much as the
 * happy path.
 */
describe("parseClientMessage", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a string", "game:start"],
    ["an array", [{ type: "game:start" }]],
    ["an object with no type", { foo: 1 }],
    ["an object with a non-string type", { type: 7 }],
    ["an unknown type", { type: "nope" }],
  ])("rejects %s", (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it.each(["game:start", "room:leave"])("accepts the bare message %s", (type) => {
    expect(parseClientMessage({ type })).toEqual({ type });
  });

  it("ignores extra properties on bare messages", () => {
    expect(parseClientMessage({ type: "game:start", evil: true })).toEqual({ type: "game:start" });
  });

  describe("player:ready", () => {
    it.each([true, false])("accepts ready=%s", (ready) => {
      expect(parseClientMessage({ type: "player:ready", ready })).toEqual({
        type: "player:ready",
        ready,
      });
    });

    it.each([
      ["a string", "true"],
      ["a number", 1],
      ["missing", undefined],
    ])("rejects ready given as %s", (_label, ready) => {
      expect(parseClientMessage({ type: "player:ready", ready })).toBeNull();
    });
  });

  describe("config:update", () => {
    it("accepts an object config", () => {
      expect(parseClientMessage({ type: "config:update", config: { barsPerSong: 4 } })).toEqual({
        type: "config:update",
        config: { barsPerSong: 4 },
      });
    });

    it("passes the config through unvalidated — sanitizeConfig is the gate", () => {
      const config = { barsPerSong: 9999, unknown: "x" };
      expect(parseClientMessage({ type: "config:update", config })).toEqual({
        type: "config:update",
        config,
      });
    });

    it.each([
      ["an array", []],
      ["a string", "x"],
      ["missing", undefined],
    ])("rejects a config given as %s", (_label, config) => {
      expect(parseClientMessage({ type: "config:update", config })).toBeNull();
    });
  });

  describe.each(["turn:autosave", "turn:submit"] as const)("%s", (type) => {
    it("accepts an array of notes", () => {
      const notes = [{ pitch: 60, start: 0, length: 1 }];
      expect(parseClientMessage({ type, notes })).toEqual({
        type,
        notes,
        instrumentId: undefined,
      });
    });

    it("accepts an empty note array", () => {
      expect(parseClientMessage({ type, notes: [] })).toEqual({
        type,
        notes: [],
        instrumentId: undefined,
      });
    });

    it.each([
      ["an object", {}],
      ["a string", "notes"],
      ["missing", undefined],
    ])("rejects notes given as %s", (_label, notes) => {
      expect(parseClientMessage({ type, notes })).toBeNull();
    });

    it("keeps a plausible instrumentId", () => {
      const msg = parseClientMessage({ type, notes: [], instrumentId: "lead" });
      expect(msg).toMatchObject({ instrumentId: "lead" });
    });

    it.each([
      ["empty", ""],
      ["longer than 40 chars", "x".repeat(41)],
      ["a number", 7],
      ["null", null],
    ])("drops an instrumentId that is %s", (_label, instrumentId) => {
      const msg = parseClientMessage({ type, notes: [], instrumentId });
      expect(msg).toMatchObject({ instrumentId: undefined });
    });

    it("keeps an instrumentId of exactly 40 chars", () => {
      const id = "x".repeat(40);
      expect(parseClientMessage({ type, notes: [], instrumentId: id })).toMatchObject({
        instrumentId: id,
      });
    });
  });

  describe("reveal:update", () => {
    it("accepts integer cursors with a boolean playing flag", () => {
      expect(
        parseClientMessage({
          type: "reveal:update",
          activeSong: 1,
          revealedLayers: 2,
          playing: true,
        }),
      ).toEqual({ type: "reveal:update", activeSong: 1, revealedLayers: 2, playing: true });
    });

    it("accepts negative integers — the reducer is responsible for clamping", () => {
      expect(
        parseClientMessage({
          type: "reveal:update",
          activeSong: -5,
          revealedLayers: -1,
          playing: false,
        }),
      ).toMatchObject({ activeSong: -5, revealedLayers: -1 });
    });

    it.each([
      ["a fractional activeSong", { activeSong: 1.5, revealedLayers: 0, playing: true }],
      ["a fractional revealedLayers", { activeSong: 0, revealedLayers: 0.5, playing: true }],
      ["NaN", { activeSong: NaN, revealedLayers: 0, playing: true }],
      ["Infinity", { activeSong: Infinity, revealedLayers: 0, playing: true }],
      ["a string playing flag", { activeSong: 0, revealedLayers: 0, playing: "yes" }],
      ["a missing field", { activeSong: 0, playing: true }],
    ])("rejects %s", (_label, fields) => {
      expect(parseClientMessage({ type: "reveal:update", ...fields })).toBeNull();
    });
  });
});

describe("sanitizeConfig", () => {
  const base: GameConfig = { ...DEFAULT_CONFIG };

  it("returns the base unchanged for an empty patch", () => {
    expect(sanitizeConfig({}, base)).toEqual(base);
  });

  it("does not mutate the base config", () => {
    const snapshot = structuredClone(base);
    sanitizeConfig({ barsPerSong: 8, selectedRoles: [] }, base);
    expect(base).toEqual(snapshot);
  });

  it("never lets stepsPerMeasure be changed — the grid resolution is fixed", () => {
    const next = sanitizeConfig({ stepsPerMeasure: 32 } as Partial<GameConfig>, base);
    expect(next.stepsPerMeasure).toBe(base.stepsPerMeasure);
  });

  describe("barsPerSong", () => {
    it.each([
      [4, 4],
      [2, 2],
      [8, 8],
      [1, 2],
      [-100, 2],
      [9, 8],
      [1000, 8],
    ])("clamps %i to %i", (input, expected) => {
      expect(sanitizeConfig({ barsPerSong: input }, base).barsPerSong).toBe(expected);
    });

    it.each([2.5, NaN, Infinity])("ignores the non-integer %s", (input) => {
      expect(sanitizeConfig({ barsPerSong: input }, base).barsPerSong).toBe(base.barsPerSong);
    });
  });

  describe("roundDurationSec", () => {
    it.each([
      [180, 180],
      [30, 30],
      [600, 600],
      [0, 30],
      [-1, 30],
      [601, 600],
    ])("clamps %i to %i", (input, expected) => {
      expect(sanitizeConfig({ roundDurationSec: input }, base).roundDurationSec).toBe(expected);
    });
  });

  describe("contextVisibility", () => {
    it.each(["previous", "all", "blind"] as const)("accepts %s", (value) => {
      expect(sanitizeConfig({ contextVisibility: value }, base).contextVisibility).toBe(value);
    });

    it("ignores an unrecognised value", () => {
      const next = sanitizeConfig(
        { contextVisibility: "everything" } as unknown as Partial<GameConfig>,
        base,
      );
      expect(next.contextVisibility).toBe(base.contextVisibility);
    });
  });

  describe("mode", () => {
    it("accepts the only known mode", () => {
      expect(sanitizeConfig({ mode: "layers" }, base).mode).toBe("layers");
    });

    it("ignores an unknown mode", () => {
      const next = sanitizeConfig({ mode: "chaos" } as unknown as Partial<GameConfig>, base);
      expect(next.mode).toBe(base.mode);
    });
  });

  describe("selectedRoles", () => {
    const allRoleIds = LAYER_ROLES.map((r) => r.id);

    it("drops unknown role ids", () => {
      const next = sanitizeConfig({ selectedRoles: ["drums", "not-a-role", "bass"] }, base);
      expect(next.selectedRoles).toEqual(["drums", "bass"]);
    });

    it("de-duplicates and restores canonical role order", () => {
      const next = sanitizeConfig({ selectedRoles: ["bass", "drums", "bass"] }, base);
      expect(next.selectedRoles).toEqual(["drums", "bass"]);
    });

    it("accepts the full role set", () => {
      expect(sanitizeConfig({ selectedRoles: [...allRoleIds] }, base).selectedRoles).toEqual(
        allRoleIds,
      );
    });

    it("allows an empty selection — the start-game guard rejects it later", () => {
      expect(sanitizeConfig({ selectedRoles: [] }, base).selectedRoles).toEqual([]);
    });

    it("ignores non-string entries", () => {
      const next = sanitizeConfig(
        { selectedRoles: ["drums", 7, null] as unknown as string[] },
        base,
      );
      expect(next.selectedRoles).toEqual(["drums"]);
    });

    it("ignores a non-array selection entirely", () => {
      const next = sanitizeConfig({ selectedRoles: "drums" as unknown as string[] }, base);
      expect(next.selectedRoles).toEqual(base.selectedRoles);
    });
  });

  it("applies several fields in one patch", () => {
    const next = sanitizeConfig(
      { barsPerSong: 100, roundDurationSec: 1, contextVisibility: "blind", selectedRoles: ["pad"] },
      base,
    );
    expect(next).toEqual({
      ...base,
      barsPerSong: 8,
      roundDurationSec: 30,
      contextVisibility: "blind",
      selectedRoles: ["pad"],
    });
  });
});
