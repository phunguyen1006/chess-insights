import type { NormalizedGame, TimeClass } from "../shared/types";
export function ratingGames(games: NormalizedGame[], pool: TimeClass) {
  return games
    .filter(
      (g) =>
        g.timeClass === pool &&
        g.rated &&
        g.rules === "chess" &&
        g.playerRating !== null,
    )
    .sort((a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id));
}
export function ratingSummary(games: NormalizedGame[], pool: TimeClass) {
  const list = ratingGames(games, pool),
    values = list.map((g) => g.playerRating!);
  return {
    games: list.length,
    current: values.at(-1) ?? null,
    start: values[0] ?? null,
    change: values.length > 1 ? values.at(-1)! - values[0] : null,
    highest: values.length ? values.reduce((a, b) => Math.max(a, b)) : null,
    lowest: values.length ? values.reduce((a, b) => Math.min(a, b)) : null,
  };
}
export function rollingAverage(
  values: number[],
  window: number,
): (number | null)[] {
  let sum = 0;
  return values.map((n, i) => {
    sum += n;
    if (i >= window) sum -= values[i - window];
    return i >= window - 1 ? sum / window : null;
  });
}
export function observedDeltas(games: NormalizedGame[]): Map<string, number> {
  const previous = new Map<string, number>();
  const deltas = new Map<string, number>();
  for (const g of [...games].sort(
    (a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id),
  )) {
    if (!g.rated || g.playerRating === null || g.rules !== "chess") continue;
    const old = previous.get(g.timeClass);
    if (old !== undefined) deltas.set(g.id, g.playerRating - old);
    previous.set(g.timeClass, g.playerRating);
  }
  return deltas;
}
export function dayRatingChanges(
  games: NormalizedGame[],
  deltas: Map<string, number>,
) {
  const pools = new Map<string, number>();
  for (const g of games) {
    const delta = deltas.get(g.id);
    if (delta !== undefined)
      pools.set(g.timeClass, (pools.get(g.timeClass) ?? 0) + delta);
  }
  return pools;
}
export function ratingDrawdown(games: NormalizedGame[], pool: TimeClass) {
  let peak = -Infinity;
  return ratingGames(games, pool).map((g) => {
    peak = Math.max(peak, g.playerRating!);
    return {
      label: g.localDate,
      value: g.playerRating! - peak,
      detail: `Observed ${g.playerRating} · peak ${peak} · ${g.opponentUsername ?? "Unknown"}`,
    };
  });
}
