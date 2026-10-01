import type { NormalizedGame, Filters } from "../shared/types";
import { POOLS, MIN_OPENING_SAMPLE } from "../shared/constants";
import { results, filterGames } from "./results";
import { ratingGames } from "./ratings";
import { aggregateOpenings } from "./openings";
import { aggregateOpponents } from "./opponents";
import { addDays, parseDate } from "../shared/dates";

export function monthlySeries(games: NormalizedGame[]) {
  const groups = new Map<string, NormalizedGame[]>();
  for (const g of games) {
    const key = g.localDate.slice(0, 7);
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  }
  const keys = [...groups.keys()].sort();
  if (keys.length) {
    const date = new Date(`${keys[0]}-01T12:00:00`),
      last = keys.at(-1)!;
    while (true) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (key > last) break;
      if (!groups.has(key)) groups.set(key, []);
      date.setMonth(date.getMonth() + 1);
    }
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({
      month,
      ...results(list),
      activeDays: new Set(list.map((g) => g.localDate)).size,
      timeoutLossRate: list.length
        ? (100 *
            list.filter(
              (g) => g.result === "loss" && g.termination === "Timeout",
            ).length) /
          list.length
        : 0,
    }));
}
export function performanceGroups(
  games: NormalizedGame[],
  by: "pool" | "color",
) {
  const keys =
    by === "pool"
      ? [
          ...POOLS,
          ...(games.some((g) => g.timeClass === "unknown") ? ["unknown"] : []),
        ]
      : ["white", "black"];
  return keys.map((label) => ({
    label,
    ...results(
      games.filter(
        (g) => (by === "pool" ? g.timeClass : g.playerColor) === label,
      ),
    ),
  }));
}
export function terminationDistribution(
  games: NormalizedGame[],
  outcome: "win" | "loss" | "draw",
) {
  const map = new Map<string, number>();
  for (const g of games)
    if (g.result === outcome)
      map.set(g.termination, (map.get(g.termination) ?? 0) + 1);
  return [...map]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));
}
export function ratingSparklines(games: NormalizedGame[]) {
  return POOLS.map((pool) => ({
    pool,
    series: ratingGames(games, pool).map((g) => ({
      label: g.localDate,
      value: g.playerRating!,
      detail: `${g.opponentUsername ?? "Unknown opponent"} · ${g.result}`,
    })),
  }));
}
export function openingScatter(games: NormalizedGame[]) {
  return aggregateOpenings(games)
    .filter((o) => o.games >= MIN_OPENING_SAMPLE)
    .slice(0, 20)
    .map((o) => ({
      label: `${o.eco} · ${o.name} · ${o.color}`,
      x: o.games,
      y: o.winRate,
      detail: `${o.games} games · ${o.wins} W / ${o.draws} D / ${o.losses} L`,
    }));
}
export function opponentBuckets(games: NormalizedGame[]) {
  const groups = new Map<number, NormalizedGame[]>();
  for (const g of games)
    if (g.opponentRating !== null) {
      const bucket = Math.floor(g.opponentRating / 200) * 200;
      const list = groups.get(bucket) ?? [];
      list.push(g);
      groups.set(bucket, list);
    }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([n, list]) => ({ label: `${n}–${n + 199}`, ...results(list) }));
}
export function previousPeriod(games: NormalizedGame[], filters: Filters) {
  if (!filters.start || !filters.end || filters.end < filters.start)
    return null;
  const days =
    Math.round(
      (Date.UTC(
        parseDate(filters.end).getFullYear(),
        parseDate(filters.end).getMonth(),
        parseDate(filters.end).getDate(),
      ) -
        Date.UTC(
          parseDate(filters.start).getFullYear(),
          parseDate(filters.start).getMonth(),
          parseDate(filters.start).getDate(),
        )) /
        86400000,
    ) + 1;
  const end = addDays(filters.start, -1),
    start = addDays(end, 1 - days);
  const current = results(filterGames(games, filters)),
    previous = results(filterGames(games, { ...filters, start, end }));
  return {
    start,
    end,
    gamesChange: current.games - previous.games,
    winRatePoints:
      current.games && previous.games
        ? current.winRate - previous.winRate
        : null,
    previousGames: previous.games,
  };
}
const cache = new WeakMap<
  NormalizedGame[],
  ReturnType<typeof computeVisuals>
>();
function computeVisuals(games: NormalizedGame[]) {
  return {
    months: monthlySeries(games),
    pools: performanceGroups(games, "pool"),
    colors: performanceGroups(games, "color"),
    openings: aggregateOpenings(games),
    opponents: aggregateOpponents(games),
    ratings: ratingSparklines(games),
  };
}
export function visualSummary(games: NormalizedGame[]) {
  let value = cache.get(games);
  if (!value) {
    value = computeVisuals(games);
    cache.set(games, value);
  }
  return value;
}
