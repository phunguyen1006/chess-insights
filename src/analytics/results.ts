import type { Filters, NormalizedGame } from "../shared/types";
export const defaultFilters: Filters = {
  timeClass: "all",
  rated: "all",
  color: "all",
  result: "all",
  start: "",
  end: "",
};
export function filterGames(
  games: NormalizedGame[],
  f: Filters,
): NormalizedGame[] {
  return games.filter(
    (g) =>
      (f.timeClass === "all" || g.timeClass === f.timeClass) &&
      (f.rated === "all" || g.rated === (f.rated === "rated")) &&
      (f.color === "all" || g.playerColor === f.color) &&
      (f.result === "all" || g.result === f.result) &&
      (!f.start || g.localDate >= f.start) &&
      (!f.end || g.localDate <= f.end),
  );
}
export function results(games: NormalizedGame[]) {
  const wins = games.filter((g) => g.result === "win").length,
    draws = games.filter((g) => g.result === "draw").length;
  return {
    games: games.length,
    wins,
    draws,
    losses: games.length - wins - draws,
    winRate: games.length ? (wins / games.length) * 100 : 0,
  };
}
export function terminationCounts(
  games: NormalizedGame[],
  result: "win" | "loss",
) {
  const counts = new Map<string, number>();
  for (const g of games)
    if (g.result === result)
      counts.set(g.termination, (counts.get(g.termination) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}
