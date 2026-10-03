import type { NormalizedGame, PuzzleAttempt } from "../shared/types";
import { byDay, heatmapIntensityScale } from "./activity";
import { streaks } from "./streaks";
import { localDate, parseDate } from "../shared/dates";
export type ActivityMode = "all" | "games" | "puzzles";
export function puzzleResults(attempts: PuzzleAttempt[]) {
  const solved = attempts.filter((a) => a.result === "solved").length,
    failed = attempts.filter((a) => a.result === "failed").length;
  return {
    attempts: attempts.length,
    solved,
    failed,
    resolved: solved + failed,
    successRate: solved + failed ? (solved / (solved + failed)) * 100 : null,
  };
}
export function puzzlesByDay(attempts: PuzzleAttempt[]) {
  const days = new Map<string, PuzzleAttempt[]>();
  for (const a of attempts) {
    const list = days.get(a.localDate) ?? [];
    list.push(a);
    days.set(a.localDate, list);
  }
  return days;
}
export function combinedActivity(
  games: NormalizedGame[],
  attempts: PuzzleAttempt[],
  today?: string,
) {
  const days = new Set([
    ...games.map((g) => g.localDate),
    ...attempts.map((a) => a.localDate),
  ]);
  return {
    games: games.length,
    puzzles: attempts.length,
    activeDays: days.size,
    ...streaks([...days], today),
  };
}
export function getCombinedActivityLevel(
  gameLevel: number,
  puzzleLevel: number,
) {
  return Math.max(gameLevel, puzzleLevel);
}
// Existing game metrics retain their scale; combined activity uses four independently normalized levels.
export function activityLevel(count: number, distribution: number[]) {
  return heatmapIntensityScale(distribution, [0.25, 0.5, 0.75])(count);
}
export function combinedLevels(
  games: NormalizedGame[],
  attempts: PuzzleAttempt[],
) {
  const g = byDay(games),
    p = puzzlesByDay(attempts),
    gv = [...g.values()].map((a) => a.length),
    pv = [...p.values()].map((a) => a.length),
    gameScale = heatmapIntensityScale(gv, [0.25, 0.5, 0.75]),
    puzzleScale = heatmapIntensityScale(pv, [0.25, 0.5, 0.75]);
  return new Map(
    [...new Set([...g.keys(), ...p.keys()])].map((date) => [
      date,
      getCombinedActivityLevel(
        gameScale(g.get(date)?.length ?? 0),
        puzzleScale(p.get(date)?.length ?? 0),
      ),
    ]),
  );
}
export function puzzleActivity(attempts: PuzzleAttempt[], today?: string) {
  const days = puzzlesByDay(attempts),
    counts = [...days].sort((a, b) => b[1].length - a[1].length);
  const best = [...days]
    .map(([date, list]) => ({ date, ...puzzleResults(list) }))
    .filter((d) => d.resolved >= 5)
    .sort(
      (a, b) => b.successRate! - a.successRate! || b.resolved - a.resolved,
    )[0];
  const monthGroups = new Map<string, PuzzleAttempt[]>();
  for (const a of attempts) {
    const month = a.localDate.slice(0, 7),
      list = monthGroups.get(month) ?? [];
    list.push(a);
    monthGroups.set(month, list);
  }
  const months = [...monthGroups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      return {
        label: month,
        ...puzzleResults(list),
        activeDays: new Set(list.map((a) => a.localDate)).size,
      };
    });
  const weekdays = Array<number>(7).fill(0);
  for (const [day, list] of days)
    weekdays[(parseDate(day).getDay() + 6) % 7] += list.length;
  return {
    ...puzzleResults(attempts),
    activeDays: days.size,
    average: days.size ? attempts.length / days.size : 0,
    ...streaks([...days.keys()], today),
    most: counts[0] ?? null,
    best,
    months,
    weekdays,
    mostMonth: [...months].sort((a, b) => b.attempts - a.attempts)[0],
  };
}
export function puzzleHistoryKnown(
  date: string,
  since: string | undefined,
  today = localDate(new Date()),
) {
  return !!since && date >= since && date <= today;
}
