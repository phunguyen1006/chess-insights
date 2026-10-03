import type { NormalizedGame } from "../shared/types";
import { results } from "./results";
import { streaks } from "./streaks";
import { parseDate } from "../shared/dates";
export function byDay(games: NormalizedGame[]) {
  const map = new Map<string, NormalizedGame[]>();
  for (const game of games) {
    const list = map.get(game.localDate) ?? [];
    list.push(game);
    map.set(game.localDate, list);
  }
  return map;
}
export function activity(games: NormalizedGame[], today?: string) {
  const days = byDay(games);
  const most = [...days].sort((a, b) => b[1].length - a[1].length)[0];
  return {
    ...results(games),
    activeDays: days.size,
    gamesPerActiveDay: days.size ? games.length / days.size : 0,
    ...streaks([...days.keys()], today),
    mostActiveDay: most?.[0] ?? null,
    mostActiveCount: most?.[1].length ?? 0,
  };
}
export function activityBreakdown(games: NormalizedGame[]) {
  const months = Array<number>(12).fill(0),
    weekdays = Array<number>(7).fill(0);
  for (const game of games) {
    const d = parseDate(game.localDate);
    months[d.getMonth()]++;
    weekdays[(d.getDay() + 6) % 7]++;
  }
  return { months, weekdays };
}
export function getHeatmapIntensity(
  count: number,
  distribution: number[],
): number {
  return heatmapIntensityScale(distribution)(count);
}
// Build thresholds once per dataset, then look up every day in constant time.
export function heatmapIntensityScale(
  distribution: number[],
  quantiles = [0.2, 0.4, 0.6, 0.8],
): (count: number) => number {
  const positive = distribution.filter((n) => n > 0).sort((a, b) => a - b);
  if (!positive.length) return (count) => (count > 0 ? 1 : 0);
  if (new Set(positive).size === 1) return (count) => (count > 0 ? 2 : 0);
  const thresholds = quantiles.map(
    (q) => positive[Math.floor((positive.length - 1) * q)],
  );
  return (count) =>
    count > 0 ? 1 + thresholds.filter((t) => count > t).length : 0;
}
