// System under test adapter. The oracle is independent.py, never this file.
import type {
  NormalizedGame,
  PuzzleAttempt,
  RawGame,
  TimeClass,
} from "../../src/shared/types";
import { normalizeGame } from "../../src/data/normalize/normalizeGame";
import { getGames, upsertArchive } from "../../src/data/storage/gameRepository";
import {
  startPuzzleTracking,
  savePuzzleAttempt,
  puzzleSnapshot,
} from "../../src/data/storage/puzzleRepository";
import {
  activity,
  activityBreakdown,
  byDay,
} from "../../src/analytics/activity";
import { results } from "../../src/analytics/results";
import {
  combinedActivity,
  puzzleActivity,
  puzzlesByDay,
} from "../../src/analytics/puzzles";
import {
  ratingGames,
  ratingSummary,
  rollingAverage,
} from "../../src/analytics/ratings";
import { aggregateOpenings } from "../../src/analytics/openings";
import { aggregateOpponents } from "../../src/analytics/opponents";
import { terminationDistribution } from "../../src/analytics/visuals";
import { parseGameDuration } from "../../src/analysis/playTime";
import { playTimeSummary } from "../../src/analytics/playTime";
import { compareEvaluations } from "../../src/analysis/evaluation";
import type { Evaluation } from "../../src/analysis/types";
import { addDays, parseDate } from "../../src/shared/dates";

export interface RawAuditData {
  username: string;
  asOf: string;
  games: unknown[];
  puzzles: PuzzleAttempt[];
  evaluations: { best: Evaluation; played: Evaluation; phase: string }[];
}
export async function collectExtension(input: RawAuditData) {
  const normalized = input.games
    .filter(
      (r): r is RawGame => !!r && typeof r === "object" && !Array.isArray(r),
    )
    .flatMap((r) => {
      const g = normalizeGame(r, input.username);
      return g ? [g] : [];
    });
  await upsertArchive(
    normalized,
    {
      id: `${input.username}:audit`,
      username: input.username,
      year: 2026,
      month: 10,
      lastFetchedAt: Date.now(),
      gameCount: normalized.length,
      syncStatus: "synced",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      fingerprint: "synthetic-audit",
    },
    {
      username: input.username,
      archives: [],
      indexFetchedAt: Date.now(),
      lastSync: Date.now(),
      version: 1,
    },
  );
  const games = await getGames(input.username);
  await startPuzzleTracking(input.username, Date.parse("2023-01-01T00:00:00Z"));
  for (const p of input.puzzles) {
    try {
      await savePuzzleAttempt(p);
    } catch {
      /* Invalid raw fixture is rejected at storage boundary. */
    }
  }
  const { attempts } = await puzzleSnapshot(input.username);
  return {
    games,
    attempts,
    metrics: extensionMetrics(games, attempts, input.evaluations),
  };
}

export function extensionMetrics(
  games: NormalizedGame[],
  attempts: PuzzleAttempt[],
  evaluations: RawAuditData["evaluations"],
) {
  const a = activity(games),
    p = puzzleActivity(attempts),
    combined = combinedActivity(games, attempts);
  const gd = Object.fromEntries(
    [...byDay(games)].map(([d, gs]) => [d, gs.length]),
  );
  const pd = Object.fromEntries(
    [...puzzlesByDay(attempts)].map(([d, ps]) => [d, ps.length]),
  );
  const cd = Object.fromEntries(
    [...new Set([...Object.keys(gd), ...Object.keys(pd)])].map((d) => [
      d,
      (gd[d] ?? 0) + (pd[d] ?? 0),
    ]),
  );
  const m: Record<string, unknown> = {
    ...results(games),
    gameActiveDays: a.activeDays,
    gamesPerActiveDay: a.gamesPerActiveDay,
    puzzles: p.attempts,
    solved: p.solved,
    failed: p.failed,
    unknownPuzzles: p.attempts - p.resolved,
    puzzleActiveDays: p.activeDays,
    puzzleSuccessRate: p.successRate,
    puzzlesPerActiveDay: p.average,
    combinedActivity: combined.games + combined.puzzles,
    combinedActiveDays: combined.activeDays,
    currentGameStreak: a.current,
    longestGameStreak: a.longest,
    currentPuzzleStreak: p.current,
    longestPuzzleStreak: p.longest,
    currentCombinedStreak: combined.current,
    longestCombinedStreak: combined.longest,
    "heatmap.games": gd,
    "heatmap.puzzles": pd,
    "heatmap.combined": cd,
    "heatmap.games.sum": games.length,
    "heatmap.puzzles.sum": attempts.length,
    "heatmap.combined.sum": combined.games + combined.puzzles,
    weekdays: activityBreakdown(games).weekdays,
    activityMonths: activityBreakdown(games).months,
    puzzleWeekdays: p.weekdays,
    hours: Array.from(
      { length: 24 },
      (_, h) =>
        games.filter((g) => new Date(g.endTime * 1000).getHours() === h).length,
    ),
  };
  for (const pool of [
    "rapid",
    "blitz",
    "bullet",
    "daily",
    "unknown",
  ] as TimeClass[]) {
    const list = games.filter((g) => g.timeClass === pool),
      vals = ratingGames(games, pool).map((g) => g.playerRating!);
    m[pool] = list.length;
    m[`pool.${pool}`] = results(list);
    m[`rating.${pool}`] = ratingSummary(games, pool);
    m[`ratingSeries.${pool}`] = vals;
    m[`ratingMean.${pool}`] = vals.length
      ? vals.reduce((s, n) => s + n, 0) / vals.length
      : null;
    m[`rolling3.${pool}`] = rollingAverage(vals, 3);
  }
  for (const color of ["white", "black"])
    m[`color.${color}`] = results(games.filter((g) => g.playerColor === color));
  for (const result of ["win", "draw", "loss"] as const)
    m[`ending.${result}`] = Object.fromEntries(
      terminationDistribution(games, result).map((r) => [r.label, r.value]),
    );
  m.openings = Object.fromEntries(
    aggregateOpenings(games).map(
      ({ key, games, wins, draws, losses, winRate }) => [
        key,
        { games, wins, draws, losses, winRate },
      ],
    ),
  );
  m.opponents = Object.fromEntries(
    aggregateOpponents(games).map(({ name, ...row }) => [name, row]),
  );
  const durations = games.map(parseGameDuration),
    time = playTimeSummary(games, durations);
  Object.assign(m, {
    knownDurations: time.withDuration,
    totalTimeSeconds: time.totalRecordedSeconds,
    dailyExcluded: time.dailyExcluded,
    unknownDurations: time.unavailable,
    averageDurationSeconds: time.averageDurationSeconds,
    durationCoverage: time.coverage,
    timeByDay: Object.fromEntries(
      time.byDay.filter((r) => r.games).map((r) => [r.date, r.durationSeconds]),
    ),
    timeByMonth: Object.fromEntries(
      time.byMonth
        .filter((r) => r.games)
        .map((r) => [r.month, r.durationSeconds]),
    ),
    durationDistribution: time.distribution.map((r) => r.count),
  });
  for (const row of time.byControl)
    m[`${row.pool}TimeSeconds`] = row.durationSeconds;
  // Week projection of the actual daily totals; there is no separate weekly Time KPI.
  const weeks = new Map<string, number>();
  for (const day of time.byDay.filter((r) => r.games)) {
    const d = parseDate(day.date),
      key = addDays(day.date, -((d.getDay() + 6) % 7));
    weeks.set(key, (weeks.get(key) ?? 0) + day.durationSeconds);
  }
  m.timeByWeek = Object.fromEntries(weeks);
  const severity = { inaccuracy: 0, mistake: 0, blunder: 0 },
    phases: Record<string, number> = {};
  for (const e of evaluations) {
    const s = compareEvaluations(e.best, e.played).severity;
    if (s) {
      severity[s]++;
      phases[e.phase] = (phases[e.phase] ?? 0) + 1;
    }
  }
  Object.assign(m, {
    inaccuracies: severity.inaccuracy,
    mistakes: severity.mistake,
    blunders: severity.blunder,
    mistakePhases: phases,
  });
  return m;
}
