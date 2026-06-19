import type { Room, RoomSnapshot } from "@musicphone/shared";

/**
 * Produce the client-facing view of a room. Melodies are withheld until the
 * results phase so players cannot peek at sections they have not yet received
 * (the "telephone" surprise is the whole point of the game).
 */
export function toSnapshot(room: Room, selfId: string): RoomSnapshot {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    config: room.config,
    players: room.players,
    round: room.round,
    totalRounds: room.totalRounds,
    roundEndsAt: room.roundEndsAt,
    ready: room.ready,
    selfId,
    melodies: room.phase === "results" ? room.melodies : [],
    reveal: room.reveal,
  };
}
