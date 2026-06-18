/**
 * Anonymous session persistence. Because the Vercel client and the Render server
 * live on different origins, we keep the per-room playerId in localStorage rather
 * than an httpOnly cookie — simpler and reliable across origins for an ephemeral
 * game. The playerId acts as the reconnect token (passed on the WS query string).
 */

const credKey = (code: string) => `mp:player:${code.toUpperCase()}`;
const NICK_KEY = "mp:nickname";

export function rememberCredentials(code: string, playerId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(credKey(code), playerId);
}

export function loadCredentials(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(credKey(code));
}

export function rememberNickname(nick: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NICK_KEY, nick);
}

export function savedNickname(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NICK_KEY) ?? "";
}
