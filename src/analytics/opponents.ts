import type { NormalizedGame } from "../shared/types";
import { MIN_OPPONENT_SAMPLE } from "../shared/constants";
import { results } from "./results";
export function aggregateOpponents(games: NormalizedGame[]) {
  const map = new Map<string, NormalizedGame[]>();
  for (const g of games) {
    if (!g.opponentUsername) continue;
    const name = g.opponentUsername.toLowerCase();
    const list = map.get(name) ?? [];
    list.push(g);
    map.set(name, list);
  }
  return [...map]
    .map(([name, list]) => {
      const rated = list.filter((g) => g.opponentRating !== null),
        diff = list.filter(
          (g) => g.opponentRating !== null && g.playerRating !== null,
        );
      return {
        name,
        ...results(list),
        averageRating: rated.length
          ? Math.round(
              rated.reduce((sum, g) => sum + g.opponentRating!, 0) /
                rated.length,
            )
          : null,
        averageDifference: diff.length
          ? Math.round(
              diff.reduce(
                (sum, g) => sum + g.playerRating! - g.opponentRating!,
                0,
              ) / diff.length,
            )
          : null,
      };
    })
    .sort((a, b) => b.games - a.games);
}
export function opponentInsights(games: NormalizedGame[]) {
  const rows = aggregateOpponents(games),
    eligible = rows
      .filter((r) => r.games >= MIN_OPPONENT_SAMPLE)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games);
  const highest = (list: NormalizedGame[]) =>
    list
      .filter((g) => g.opponentRating !== null)
      .sort((a, b) => b.opponentRating! - a.opponentRating!)[0] ?? null;
  return {
    mostFaced: rows[0] ?? null,
    highestFaced: highest(games),
    highestBeaten: highest(games.filter((g) => g.result === "win")),
    best: eligible[0] ?? null,
    worst: eligible.at(-1) ?? null,
  };
}
