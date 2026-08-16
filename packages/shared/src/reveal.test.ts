import { describe, expect, it } from "vitest";
import { canControlReveal } from "./reveal";
import type { Player, RevealState } from "./types";

const player = (id: string, connected: boolean): Player => ({
  id,
  name: id,
  connected,
  isHost: id === "host",
});

const reveal = (done = false): RevealState => ({
  activeSong: 0,
  revealedLayers: 0,
  playing: false,
  done,
});

/** host, the current song's author, and an unrelated bystander. */
function room(connected: { host: boolean; author: boolean; other: boolean }): Player[] {
  return [
    player("host", connected.host),
    player("author", connected.author),
    player("other", connected.other),
  ];
}

const can = (players: Player[], playerId: string, state = reveal()) =>
  canControlReveal(state, players, "host", "author", playerId);

describe("canControlReveal", () => {
  describe("while the author is present", () => {
    const players = room({ host: true, author: true, other: true });

    it("lets the author present their own song", () => {
      expect(can(players, "author")).toBe(true);
    });

    it("lets the host step in as moderator", () => {
      expect(can(players, "host")).toBe(true);
    });

    it("does not let a bystander take over", () => {
      expect(can(players, "other")).toBe(false);
    });
  });

  describe("once the author has gone", () => {
    const players = room({ host: true, author: false, other: true });

    it("lets the host keep the game moving", () => {
      expect(can(players, "host")).toBe(true);
    });

    it("still does not hand control to a bystander while the host is here", () => {
      expect(can(players, "other")).toBe(false);
    });

    it("would still accept the author if they came back", () => {
      expect(can(players, "author")).toBe(true);
    });
  });

  describe("once both the author and the host have gone", () => {
    const players = room({ host: false, author: false, other: true });

    it("hands control to whoever is left, so results cannot deadlock", () => {
      expect(can(players, "other")).toBe(true);
    });
  });

  describe("when the host is gone but the author is present", () => {
    const players = room({ host: false, author: true, other: true });

    it("keeps the author presenting", () => {
      expect(can(players, "author")).toBe(true);
    });

    it("does not give a bystander control while the author is here", () => {
      expect(can(players, "other")).toBe(false);
    });
  });

  it("nobody controls anything once the reveal is finished", () => {
    const players = room({ host: true, author: true, other: true });
    for (const id of ["host", "author", "other"]) {
      expect(can(players, id, reveal(true))).toBe(false);
    }
  });

  it("falls back to anyone present when the song has no known author", () => {
    const players = room({ host: false, author: true, other: true });
    expect(canControlReveal(reveal(), players, "host", undefined, "other")).toBe(true);
  });

  it("always lets the host control, even when they are the author", () => {
    const players = [player("host", true), player("other", true)];
    expect(canControlReveal(reveal(), players, "host", "host", "host")).toBe(true);
  });

  it("never leaves a live results screen with nobody able to drive it", () => {
    // Exhaustive over every combination of who is still connected.
    for (const host of [true, false]) {
      for (const author of [true, false]) {
        for (const other of [true, false]) {
          const players = room({ host, author, other });
          const present = players.filter((p) => p.connected);
          if (present.length === 0) continue; // nobody there to care

          const anyoneCanDrive = present.some((p) => can(players, p.id));
          expect(anyoneCanDrive, `host=${host} author=${author} other=${other}`).toBe(true);
        }
      }
    }
  });
});
