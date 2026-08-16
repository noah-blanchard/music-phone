import type { Player, RevealState } from "./types";

/**
 * Who may drive the guided reveal in the results phase.
 *
 * Each song is presented by its author, which is the whole point of the reveal:
 * you sit and watch your song get built up. But presenting was originally the
 * *only* way to advance, so an author who closed their tab froze the results
 * screen for everyone, permanently, with no way to finish the game.
 *
 * The rule now falls back in order:
 *
 *  1. the current song's author, as before;
 *  2. the host, who can always move things along;
 *  3. anyone still connected, if neither of the above is here to do it.
 *
 * That third clause is what makes a deadlock impossible: control can never rest
 * solely with someone who has gone.
 */
export function canControlReveal(
  reveal: RevealState,
  players: Player[],
  hostId: string,
  presenterId: string | undefined,
  playerId: string,
): boolean {
  if (reveal.done) return false;
  if (playerId === presenterId) return true;
  if (playerId === hostId) return true;

  const isHere = (id: string | undefined) =>
    id !== undefined && players.some((p) => p.id === id && p.connected);

  return !isHere(presenterId) && !isHere(hostId);
}
