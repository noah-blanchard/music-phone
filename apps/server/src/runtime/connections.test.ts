import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@musicphone/shared";
import { ConnectionRegistry, type Connection } from "./connections";

const PING: ServerMessage = { type: "round:ended", round: 0 };

let registry: ConnectionRegistry;
beforeEach(() => {
  registry = new ConnectionRegistry();
});

function connect(
  id: string,
  playerId: string,
  code = "ABCD",
): Connection & { sent: ServerMessage[] } {
  const sent: ServerMessage[] = [];
  const connection: Connection = { id, code, playerId, send: (m) => sent.push(m) };
  registry.add(connection);
  return { ...connection, sent };
}

describe("ConnectionRegistry", () => {
  it("reports a player as connected while they hold a socket", () => {
    connect("c1", "alice");
    expect(registry.hasPlayer("ABCD", "alice")).toBe(true);
    expect(registry.hasPlayer("ABCD", "bob")).toBe(false);
    expect(registry.hasPlayer("WXYZ", "alice")).toBe(false);
  });

  it("delivers to every socket in a room", () => {
    const a = connect("c1", "alice");
    const b = connect("c2", "bob");
    registry.sendToRoom("ABCD", PING);
    expect(a.sent).toEqual([PING]);
    expect(b.sent).toEqual([PING]);
  });

  it("keeps rooms isolated from one another", () => {
    const here = connect("c1", "alice", "ABCD");
    const elsewhere = connect("c2", "bob", "WXYZ");
    registry.sendToRoom("ABCD", PING);
    expect(here.sent).toHaveLength(1);
    expect(elsewhere.sent).toHaveLength(0);
  });

  it("returns the connection it removed, and forgets it", () => {
    connect("c1", "alice");
    expect(registry.remove("c1")).toMatchObject({ id: "c1", playerId: "alice" });
    expect(registry.hasPlayer("ABCD", "alice")).toBe(false);
    expect(registry.remove("c1")).toBeUndefined();
  });

  it("ignores removal of an unknown connection", () => {
    expect(registry.remove("nope")).toBeUndefined();
  });

  /* ------------------------------------------------------------------ *
   * The reconnect race. Keying by playerId made these tests impossible. *
   * ------------------------------------------------------------------ */

  describe("a player holding two sockets", () => {
    it("stays connected when the older socket closes after the newer one opens", () => {
      const old = connect("old", "alice");
      const fresh = connect("new", "alice");

      // The reconnect completed first; the old socket's close arrives after.
      registry.remove("old");

      expect(registry.hasPlayer("ABCD", "alice")).toBe(true);
      registry.sendToRoom("ABCD", PING);
      expect(fresh.sent).toEqual([PING]);
      expect(old.sent).toEqual([]);
    });

    it("stays connected when the sockets close in the other order", () => {
      connect("old", "alice");
      connect("new", "alice");
      registry.remove("new");
      expect(registry.hasPlayer("ABCD", "alice")).toBe(true);
    });

    it("is only disconnected once every socket has gone", () => {
      connect("one", "alice");
      connect("two", "alice");
      registry.remove("one");
      expect(registry.hasPlayer("ABCD", "alice")).toBe(true);
      registry.remove("two");
      expect(registry.hasPlayer("ABCD", "alice")).toBe(false);
    });

    it("delivers to both of that player's sockets", () => {
      const first = connect("one", "alice");
      const second = connect("two", "alice");
      registry.sendToPlayer("ABCD", "alice", PING);
      expect(first.sent).toEqual([PING]);
      expect(second.sent).toEqual([PING]);
    });
  });

  describe("playersIn", () => {
    it("counts each player once however many sockets they hold", () => {
      connect("c1", "alice");
      connect("c2", "alice");
      connect("c3", "bob");
      expect(registry.playersIn("ABCD")).toEqual(new Set(["alice", "bob"]));
    });

    it("is empty for an unknown room", () => {
      expect(registry.playersIn("NOPE")).toEqual(new Set());
    });
  });

  describe("sendPerPlayer", () => {
    it("builds one message per player and sends it to all their sockets", () => {
      const aliceOne = connect("c1", "alice");
      const aliceTwo = connect("c2", "alice");
      const bob = connect("c3", "bob");

      const build = vi.fn(
        (playerId: string): ServerMessage => ({ type: "error", code: "x", message: playerId }),
      );
      registry.sendPerPlayer("ABCD", build);

      // Built per player, not per socket.
      expect(build).toHaveBeenCalledTimes(2);
      expect(aliceOne.sent).toEqual([{ type: "error", code: "x", message: "alice" }]);
      expect(aliceTwo.sent).toEqual(aliceOne.sent);
      expect(bob.sent).toEqual([{ type: "error", code: "x", message: "bob" }]);
    });

    it("skips a player the builder declines to address", () => {
      const alice = connect("c1", "alice");
      registry.sendPerPlayer("ABCD", () => undefined);
      expect(alice.sent).toEqual([]);
    });
  });

  describe("size", () => {
    it("counts sockets and drops the room once the last one leaves", () => {
      connect("c1", "alice");
      connect("c2", "bob");
      expect(registry.size("ABCD")).toBe(2);
      registry.remove("c1");
      registry.remove("c2");
      expect(registry.size("ABCD")).toBe(0);
    });
  });

  it("replaces an entry rather than orphaning it if an id is somehow reused", () => {
    const first = connect("dup", "alice");
    const second = connect("dup", "bob");

    expect(registry.hasPlayer("ABCD", "alice")).toBe(false);
    expect(registry.hasPlayer("ABCD", "bob")).toBe(true);
    registry.sendToRoom("ABCD", PING);
    expect(first.sent).toEqual([]);
    expect(second.sent).toEqual([PING]);
  });
});
