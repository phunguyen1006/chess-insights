import type { NormalizedGame } from "../shared/types";
import { MIN_OPENING_SAMPLE } from "../shared/constants";
import { results } from "./results";
export function aggregateOpenings(games: NormalizedGame[]) {
  const map = new Map<string, NormalizedGame[]>();
  for (const g of games) {
    if (!g.eco && !g.openingName) continue;
    const key = `${g.playerColor}:${g.eco ?? ""}:${g.openingName ?? ""}`;
    const list = map.get(key) ?? [];
    list.push(g);
    map.set(key, list);
  }
  return [...map]
    .map(([key, list]) => ({
      key,
      eco: list[0].eco ?? "—",
      name: list[0].openingName ?? `ECO ${list[0].eco}`,
      color: list[0].playerColor,
      ...results(list),
    }))
    .sort((a, b) => b.games - a.games);
}
export function rankOpenings(games: NormalizedGame[], mode: string) {
  const rows = aggregateOpenings(games);
  if (mode === "most") return rows;
  return rows
    .filter((r) => r.games >= MIN_OPENING_SAMPLE)
    .sort((a, b) =>
      mode === "best"
        ? b.winRate - a.winRate || b.games - a.games
        : a.winRate - b.winRate || b.games - a.games,
    );
}
