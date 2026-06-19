/**
 * Deterministic signature color for a player, reused everywhere (lobby strips,
 * ready lights, results segments) so each player keeps one identity color.
 */
const PALETTE = [
  "#ffae42", // amber
  "#4fd0ff", // cyan
  "#4ee6a0", // green
  "#e36cc4", // magenta
  "#8b6fd6", // violet
  "#f2c14e", // gold
  "#ff7a59", // coral
  "#3aa6a6", // teal
];

export function playerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** First character of a nickname, uppercased, for avatar glyphs. */
export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
