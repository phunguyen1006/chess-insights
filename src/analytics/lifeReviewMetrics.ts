import type { NormalizedGame, TimeClass } from "../shared/types";
import {
  addDays,
  fromUnixLocal,
  localDate,
  parseDate,
  validCompletionTime,
} from "../shared/dates";
import { POOLS } from "../shared/constants";
import { ratingGames } from "./ratings";
import { results } from "./results";
import { streaks } from "./streaks";
import {
  playTimeSummary,
  sessionAnalytics,
  type PlayTimeSummary,
  type SessionAnalytics,
} from "./playTime";
import {
  durationFingerprint,
  eligibleForPlayTime,
  PLAY_TIME_PARSER_VERSION,
  type GameDurationRecord,
} from "../analysis/playTime";

export const LIFE_REVIEW_RANGES = [
  ["week", "This Week"],
  ["month", "This Month"],
  ["lastMonth", "Last Month"],
  ["30days", "Last 30 Days"],
  ["quarter", "This Quarter"],
  ["year", "This Year"],
  ["lastYear", "Last Year"],
  ["all", "All Time"],
  ["custom", "Custom Range"],
] as const;
export type LifeRangeKey = (typeof LIFE_REVIEW_RANGES)[number][0];
export interface LifeRange {
  key: LifeRangeKey;
  label: string;
  start: string;
  end: string;
  previous: {
    start: string;
    end: string;
    label: string;
    endExclusiveMs?: number;
  } | null;
  error?: string;
  comparisonNote: string;
  /** Captured once when selecting a range, for reproducible partial-period coverage. */
  asOfMs?: number;
}
export interface LifeRating {
  start: number | null;
  end: number | null;
  change: number | null;
  high: number | null;
  low: number | null;
  drawdown: number | null;
  points: {
    date: string;
    rating: number;
    game: NormalizedGame;
    change: number | null;
  }[];
  days: { date: string; change: number }[];
  biggestGain: { date: string; change: number } | null;
  biggestLoss: { date: string; change: number } | null;
}
export interface LifeStreak {
  games: NormalizedGame[];
  length: number;
}
export interface LifeDay {
  date: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  seconds: number | null;
}
export interface LifePeriodSummary {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  activeDays: number;
  totalDays: number;
  longestActiveStreak: number;
  longestInactiveGap: number;
  medianGamesPerActiveDay: number | null;
  varianceGamesPerDay: number;
  varianceSecondsPerDay: number | null;
  days: LifeDay[];
  time: PlayTimeSummary;
  sessions: SessionAnalytics;
  medianSessionSeconds: number | null;
  hourCells: {
    weekday: number;
    hour: number;
    games: number;
    seconds: number | null;
    knownDurations: number;
  }[];
  hours: { hour: number; games: number }[];
  weekday: { weekday: number; games: number }[];
  sessionBins: { label: string; count: number }[];
  monthly: {
    month: string;
    games: number;
    winRate: number;
    seconds: number | null;
    rating: number | null;
    change: number | null;
  }[];
  streaks: { win: LifeStreak; unbeaten: LifeStreak; loss: LifeStreak };
}
export interface LifeReview {
  games: NormalizedGame[];
  previousGames: NormalizedGame[];
  range: LifeRange;
  pool: TimeClass;
  rating: LifeRating;
  ratingPrevious: LifeRating;
  current: LifePeriodSummary;
  previous: LifePeriodSummary | null;
}

function validDate(key: string | undefined): key is string {
  return (
    !!key &&
    /^\d{4}-\d{2}-\d{2}$/.test(key) &&
    Number(key.slice(0, 4)) >= 1900 &&
    Number.isFinite(parseDate(key).getTime()) &&
    localDate(parseDate(key)) === key
  );
}
export function lifeCalendarDays(start: string, end: string): number {
  if (!validDate(start) || !validDate(end) || end < start) return 0;
  const civil = (key: string) =>
    Date.UTC(
      Number(key.slice(0, 4)),
      Number(key.slice(5, 7)) - 1,
      Number(key.slice(8, 10)),
    );
  return Math.round((civil(end) - civil(start)) / 86_400_000) + 1;
}
const monthStart = (year: number, month: number) =>
  localDate(new Date(year, month, 1, 12));
function matchedPrevious(
  start: string,
  end: string,
  previousStart: string,
  previousLast: string,
  label: string,
  now: Date,
) {
  const matchedEnd = addDays(previousStart, lifeCalendarDays(start, end) - 1);
  const previousEnd = matchedEnd > previousLast ? previousLast : matchedEnd;
  // A current day still in progress is compared with the same local wall time.
  // A shorter completed calendar period is compared in full instead.
  const cutoff = parseDate(previousEnd);
  if (matchedEnd <= previousLast)
    cutoff.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
  else {
    cutoff.setDate(cutoff.getDate() + 1);
    cutoff.setHours(0, 0, 0, 0);
  }
  return {
    start: previousStart,
    end: previousEnd,
    label,
    endExclusiveMs: cutoff.getTime() + (matchedEnd <= previousLast ? 1 : 0),
  };
}
export function resolveLifeRange(
  key: LifeRangeKey,
  now = new Date(),
  customStart?: string,
  customEnd?: string,
  earliestDate?: string,
): LifeRange {
  const today = localDate(now),
    year = now.getFullYear(),
    month = now.getMonth();
  const range: LifeRange = {
    key,
    label: LIFE_REVIEW_RANGES.find(([k]) => k === key)?.[1] ?? "Custom Range",
    start: today,
    end: today,
    previous: null,
    comparisonNote: "",
    asOfMs: now.getTime(),
  };
  const elapsedNote =
    "Compared with the same elapsed calendar days of the previous period, through the same local time today; shorter previous periods are capped at their end.";
  if (key === "week") {
    range.start = addDays(today, -((now.getDay() + 6) % 7));
    range.previous = matchedPrevious(
      range.start,
      today,
      addDays(range.start, -7),
      addDays(range.start, -1),
      "Previous week · matched days",
      now,
    );
  } else if (key === "month") {
    range.start = monthStart(year, month);
    range.previous = matchedPrevious(
      range.start,
      today,
      monthStart(year, month - 1),
      addDays(range.start, -1),
      "Previous month · matched days",
      now,
    );
  } else if (key === "quarter") {
    const quarterMonth = Math.floor(month / 3) * 3;
    range.start = monthStart(year, quarterMonth);
    range.previous = matchedPrevious(
      range.start,
      today,
      monthStart(year, quarterMonth - 3),
      addDays(range.start, -1),
      "Previous quarter · matched days",
      now,
    );
  } else if (key === "year") {
    range.start = `${year}-01-01`;
    range.previous = matchedPrevious(
      range.start,
      today,
      `${year - 1}-01-01`,
      `${year - 1}-12-31`,
      "Previous year · matched days",
      now,
    );
  } else if (key === "lastMonth") {
    range.start = monthStart(year, month - 1);
    range.end = addDays(monthStart(year, month), -1);
    range.previous = {
      start: monthStart(year, month - 2),
      end: addDays(range.start, -1),
      label: "Previous full month",
    };
    range.comparisonNote =
      "Full calendar months are compared; their day counts can differ.";
  } else if (key === "lastYear") {
    range.start = `${year - 1}-01-01`;
    range.end = `${year - 1}-12-31`;
    range.previous = {
      start: `${year - 2}-01-01`,
      end: `${year - 2}-12-31`,
      label: "Previous full year",
    };
    range.comparisonNote =
      "Full calendar years are compared; leap years can have one more day.";
  } else if (key === "all") {
    range.start =
      validDate(earliestDate) && earliestDate <= today ? earliestDate : today;
    range.comparisonNote =
      "All cached history has no preceding period to compare. Uncached archives are not included.";
  } else if (key === "custom") {
    if (
      !validDate(customStart) ||
      !validDate(customEnd) ||
      customEnd < customStart ||
      customStart > today
    ) {
      range.error =
        "Choose valid dates with the start on or before the end, and on or before today.";
      return range;
    }
    range.start = customStart;
    range.end = customEnd > today ? today : customEnd;
  } else if (key === "30days") range.start = addDays(today, -29);
  if (["week", "month", "quarter", "year"].includes(key))
    range.comparisonNote = elapsedNote;
  if (key === "30days" || key === "custom") {
    const previousEnd = addDays(range.start, -1),
      days = lifeCalendarDays(range.start, range.end);
    range.previous = {
      start: addDays(previousEnd, 1 - days),
      end: previousEnd,
      label: `Previous ${days} days`,
    };
    if (range.end === today) {
      const cutoff = parseDate(previousEnd);
      cutoff.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
      );
      range.previous.endExclusiveMs = cutoff.getTime() + 1;
    }
    range.comparisonNote = `Compared with the immediately preceding ${days} calendar days${range.end === today ? ", through the same local time on the last day" : ""}.`;
  }
  return range;
}

export function sanitizeLifeGames(
  input: NormalizedGame[],
  now = Date.now(),
): NormalizedGame[] {
  const unique = new Map<string, NormalizedGame>();
  for (const game of input) {
    if (
      !game ||
      typeof game.id !== "string" ||
      !game.id ||
      game.rules !== "chess" ||
      !validCompletionTime(game.endTime, now) ||
      !["win", "draw", "loss"].includes(game.result) ||
      !["white", "black"].includes(game.playerColor) ||
      ![...POOLS, "unknown"].includes(game.timeClass)
    )
      continue;
    if (!unique.has(game.id))
      unique.set(game.id, { ...game, localDate: fromUnixLocal(game.endTime) });
  }
  return [...unique.values()].sort(
    (a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id),
  );
}
export function lifeRating(
  games: NormalizedGame[],
  pool: TimeClass,
): LifeRating {
  const list = ratingGames(games, pool).filter(
    (game) => Number.isFinite(game.playerRating) && game.playerRating! > 0,
  );
  let peak = -Infinity,
    drawdown = 0;
  const points = list.map((game, index) => {
    peak = Math.max(peak, game.playerRating!);
    drawdown = Math.min(drawdown, game.playerRating! - peak);
    return {
      date: game.localDate,
      rating: game.playerRating!,
      game,
      change: index ? game.playerRating! - list[index - 1].playerRating! : null,
    };
  });
  const grouped = new Map<string, typeof points>();
  for (const point of points) {
    const day = grouped.get(point.date) ?? [];
    day.push(point);
    grouped.set(point.date, day);
  }
  const days = [...grouped]
    .filter(([, day]) => day.length >= 2)
    .map(([date, day]) => ({
      date,
      change: day.at(-1)!.rating - day[0].rating,
    }));
  const gain =
    [...days]
      .filter((day) => day.change > 0)
      .sort((a, b) => b.change - a.change || a.date.localeCompare(b.date))[0] ??
    null;
  const loss =
    [...days]
      .filter((day) => day.change < 0)
      .sort((a, b) => a.change - b.change || a.date.localeCompare(b.date))[0] ??
    null;
  const first = points[0]?.rating ?? null,
    last = points.at(-1)?.rating ?? null;
  return {
    start: first,
    end: last,
    change: points.length > 1 ? last! - first! : null,
    high: points.length ? peak : null,
    low: points.length
      ? points.reduce(
          (lowest, point) => Math.min(lowest, point.rating),
          Infinity,
        )
      : null,
    drawdown: points.length ? drawdown : null,
    points,
    days,
    biggestGain: gain,
    biggestLoss: loss,
  };
}
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const variance = (values: number[]): number => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  );
};
function longestRun(
  games: NormalizedGame[],
  matches: (game: NormalizedGame) => boolean,
): LifeStreak {
  let bestStart = 0,
    bestLength = 0,
    start = 0,
    length = 0;
  for (let index = 0; index < games.length; index++) {
    if (matches(games[index])) {
      if (!length) start = index;
      length++;
    } else length = 0;
    if (length > bestLength) {
      bestStart = start;
      bestLength = length;
    }
  }
  return {
    games: games.slice(bestStart, bestStart + bestLength),
    length: bestLength,
  };
}
function summarizePeriod(
  games: NormalizedGame[],
  start: string,
  end: string,
  durations: GameDurationRecord[],
  allGames: NormalizedGame[],
  pool: TimeClass,
): LifePeriodSummary {
  const days = new Map<string, LifeDay>();
  for (let date = start; date <= end; date = addDays(date, 1))
    days.set(date, {
      date,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      seconds: null,
    });
  const selected = new Map(games.map((game) => [game.id, game]));
  const durationMap = new Map(
    durations
      .filter((record) => {
        const game = selected.get(record.id);
        return (
          game &&
          eligibleForPlayTime(game) &&
          record.username === game.username &&
          record.parserVersion === PLAY_TIME_PARSER_VERSION &&
          record.fingerprint === durationFingerprint(game) &&
          record.durationSeconds !== null &&
          Number.isFinite(record.durationSeconds) &&
          record.durationSeconds > 0
        );
      })
      .map((record) => [record.id, record]),
  );
  const cells = Array.from({ length: 168 }, (_, index) => ({
    weekday: Math.floor(index / 24),
    hour: index % 24,
    games: 0,
    seconds: null as number | null,
    knownDurations: 0,
  }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, games: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    games: 0,
  }));
  const eligibleByDay = new Map<string, number>(),
    knownByDay = new Map<string, number>();
  const months = new Map<string, NormalizedGame[]>();
  for (const day of days.keys())
    if (!months.has(day.slice(0, 7))) months.set(day.slice(0, 7), []);
  for (const game of games) {
    const day = days.get(game.localDate)!;
    day.games++;
    day[
      game.result === "win"
        ? "wins"
        : game.result === "draw"
          ? "draws"
          : "losses"
    ]++;
    const record = durationMap.get(game.id);
    if (eligibleForPlayTime(game))
      eligibleByDay.set(
        game.localDate,
        (eligibleByDay.get(game.localDate) ?? 0) + 1,
      );
    if (record)
      knownByDay.set(game.localDate, (knownByDay.get(game.localDate) ?? 0) + 1);
    if (record) day.seconds = (day.seconds ?? 0) + record.durationSeconds!;
    const date = new Date(game.endTime * 1000),
      hour = date.getHours(),
      weekday = (date.getDay() + 6) % 7;
    const cell = cells[weekday * 24 + hour];
    cell.games++;
    hours[hour].games++;
    weekdays[weekday].games++;
    if (record) {
      cell.seconds = (cell.seconds ?? 0) + record.durationSeconds!;
      cell.knownDurations++;
    }
    months.get(game.localDate.slice(0, 7))!.push(game);
  }
  const rows = [...days.values()],
    active = rows.filter((day) => day.games > 0);
  let longestInactiveGap = 0,
    inactive = 0;
  for (const day of rows) {
    inactive = day.games ? 0 : inactive + 1;
    longestInactiveGap = Math.max(longestInactiveGap, inactive);
  }
  const time = playTimeSummary(games, durations),
    sessions = sessionAnalytics(games, durations, 30, allGames);
  // Unknown duration is not zero playing time. A day with partial real-time
  // duration coverage is excluded, as is a Daily-only day. Truly inactive
  // cached calendar days contribute zero recorded real-time seconds.
  const varianceDays = rows.filter(
    (day) =>
      !day.games ||
      ((eligibleByDay.get(day.date) ?? 0) > 0 &&
        eligibleByDay.get(day.date) === knownByDay.get(day.date)),
  );
  return {
    ...results(games),
    activeDays: active.length,
    totalDays: rows.length,
    longestActiveStreak: streaks(
      active.map((day) => day.date),
      end,
    ).longest,
    longestInactiveGap,
    medianGamesPerActiveDay: median(active.map((day) => day.games)),
    varianceGamesPerDay: variance(rows.map((day) => day.games)),
    varianceSecondsPerDay: durationMap.size
      ? variance(varianceDays.map((day) => day.seconds ?? 0))
      : null,
    days: rows,
    time,
    sessions,
    medianSessionSeconds: median(
      sessions.sessions.map((session) => session.durationSeconds),
    ),
    hourCells: cells,
    hours,
    weekday: weekdays,
    sessionBins: sessions.distribution,
    monthly: [...months].map(([month, list]) => {
      const rating = lifeRating(list, pool),
        known = list.flatMap((game) =>
          durationMap.has(game.id)
            ? [durationMap.get(game.id)!.durationSeconds!]
            : [],
        );
      return {
        month,
        games: list.length,
        winRate: results(list).winRate,
        seconds: known.length
          ? known.reduce((sum, seconds) => sum + seconds, 0)
          : null,
        rating: rating.end,
        change: rating.change,
      };
    }),
    streaks: {
      win: longestRun(games, (game) => game.result === "win"),
      unbeaten: longestRun(games, (game) => game.result !== "loss"),
      loss: longestRun(games, (game) => game.result === "loss"),
    },
  };
}
export function buildLifeReview(
  games: NormalizedGame[],
  range: LifeRange,
  durations: GameDurationRecord[] = [],
  requestedPool?: TimeClass,
): LifeReview {
  const all = sanitizeLifeGames(games, range.asOfMs ?? Date.now());
  const current = range.error
    ? []
    : all.filter(
        (game) =>
          game.localDate >= range.start &&
          game.localDate <= range.end &&
          (range.asOfMs === undefined || game.endTime * 1000 <= range.asOfMs),
      );
  const previous =
    range.previous && !range.error
      ? all.filter(
          (game) =>
            game.localDate >= range.previous!.start &&
            game.localDate <= range.previous!.end &&
            (range.previous!.endExclusiveMs === undefined ||
              game.endTime * 1000 < range.previous!.endExclusiveMs),
        )
      : [];
  const ratedCounts = POOLS.map((pool) => ({
    pool,
    count: current.filter(
      (game) =>
        game.timeClass === pool &&
        game.rated &&
        Number.isFinite(game.playerRating) &&
        game.playerRating! > 0,
    ).length,
  }));
  const pool =
    requestedPool ?? [...ratedCounts].sort((a, b) => b.count - a.count)[0].pool;
  return {
    games: current,
    previousGames: previous,
    range,
    pool,
    rating: lifeRating(current, pool),
    ratingPrevious: lifeRating(previous, pool),
    current: summarizePeriod(
      current,
      range.start,
      range.end,
      durations,
      all,
      pool,
    ),
    previous:
      range.previous && !range.error
        ? summarizePeriod(
            previous,
            range.previous.start,
            range.previous.end,
            durations,
            all,
            pool,
          )
        : null,
  };
}
