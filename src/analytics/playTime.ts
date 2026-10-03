import type { NormalizedGame, TimeClass } from "../shared/types";
import {
  durationFingerprint,
  eligibleForPlayTime,
  PLAY_TIME_PARSER_VERSION,
  type GameDurationRecord,
} from "../analysis/playTime";
import { observedDeltas } from "./ratings";

export const SESSION_GAP_MINUTES = 30;
export interface PlayTimeGroup {
  durationSeconds: number;
  games: number;
  eligibleGames: number;
  coverage: number;
  averageDurationSeconds: number | null;
}
export interface PlayTimeDay extends PlayTimeGroup {
  date: string;
}
export interface PlayTimeMonth extends PlayTimeGroup {
  month: string;
}
export interface PlayTimeControl extends PlayTimeGroup {
  pool: TimeClass;
  share: number;
}
export interface DurationGame {
  game: NormalizedGame;
  record: GameDurationRecord;
}
export interface PlayTimeSummary {
  selectedGames: number;
  eligibleRealtimeGames: number;
  withDuration: number;
  unavailable: number;
  dailyExcluded: number;
  exactHeaderDuration: number;
  reconstructedFromClock: number;
  emtDuration: number;
  coverage: number;
  totalRecordedSeconds: number;
  averageDurationSeconds: number | null;
  byControl: PlayTimeControl[];
  byDay: PlayTimeDay[];
  byMonth: PlayTimeMonth[];
  distribution: { label: string; count: number }[];
  longestGames: DurationGame[];
  highlights: {
    mostTimeDay: PlayTimeDay | null;
    mostGamesDay: PlayTimeDay | null;
    mostTimeMonth: PlayTimeMonth | null;
    longestGame: DurationGame | null;
  };
}
function recordMap(games: NormalizedGame[], records: GameDurationRecord[]) {
  const selected = new Map(games.map((g) => [g.id, g]));
  return new Map(
    records
      .filter((r) => {
        const game = selected.get(r.id);
        return (
          !!game &&
          r.username === game.username &&
          r.parserVersion === PLAY_TIME_PARSER_VERSION &&
          r.fingerprint === durationFingerprint(game)
        );
      })
      .map((r) => [r.id, r]),
  );
}
function group(
  list: NormalizedGame[],
  records: Map<string, GameDurationRecord>,
): PlayTimeGroup {
  const known = list
    .map((g) => records.get(g.id))
    .filter(
      (r): r is GameDurationRecord =>
        !!r &&
        r.durationSeconds !== null &&
        Number.isFinite(r.durationSeconds) &&
        r.durationSeconds > 0,
    );
  const durationSeconds = known.reduce((sum, r) => sum + r.durationSeconds!, 0);
  return {
    durationSeconds,
    games: known.length,
    eligibleGames: list.length,
    coverage: list.length ? known.length / list.length : 0,
    averageDurationSeconds: known.length
      ? durationSeconds / known.length
      : null,
  };
}
function buckets(list: NormalizedGame[], key: (g: NormalizedGame) => string) {
  const output = new Map<string, NormalizedGame[]>();
  for (const g of list) {
    const k = key(g);
    const values = output.get(k) ?? [];
    values.push(g);
    output.set(k, values);
  }
  return output;
}
function maxBy<T>(list: T[], value: (row: T) => number): T | null {
  return list.reduce<T | null>(
    (best, row) => (!best || value(row) > value(best) ? row : best),
    null,
  );
}
export function playTimeSummary(
  games: NormalizedGame[],
  records: GameDurationRecord[],
): PlayTimeSummary {
  const eligible = games.filter(eligibleForPlayTime),
    mapped = recordMap(eligible, records),
    summary = group(eligible, mapped);
  const known: DurationGame[] = eligible.flatMap((game) => {
    const record = mapped.get(game.id);
    return record?.durationSeconds !== null &&
      record?.durationSeconds !== undefined &&
      record.durationSeconds > 0
      ? [{ game, record }]
      : [];
  });
  const byDay = [...buckets(eligible, (g) => g.localDate)]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, ...group(list, mapped) }));
  const byMonth = [...buckets(eligible, (g) => g.localDate.slice(0, 7))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => ({ month, ...group(list, mapped) }));
  const byControl = (["rapid", "blitz", "bullet"] as const).map((pool) => {
    const values = group(
      eligible.filter((g) => g.timeClass === pool),
      mapped,
    );
    return {
      pool,
      ...values,
      share: summary.durationSeconds
        ? values.durationSeconds / summary.durationSeconds
        : 0,
    };
  });
  const limits = [60, 180, 300, 600, 1200, Infinity],
    labels = [
      "<1 min",
      "1–3 min",
      "3–5 min",
      "5–10 min",
      "10–20 min",
      "20+ min",
    ];
  const distribution = limits.map((limit, i) => ({
    label: labels[i],
    count: known.filter(
      ({ record }) =>
        record.durationSeconds! >= (i ? limits[i - 1] : 0) &&
        record.durationSeconds! < limit,
    ).length,
  }));
  const longestGames = [...known]
    .sort(
      (a, b) =>
        b.record.durationSeconds! - a.record.durationSeconds! ||
        b.game.endTime - a.game.endTime ||
        a.game.id.localeCompare(b.game.id),
    )
    .slice(0, 10);
  return {
    selectedGames: games.length,
    eligibleRealtimeGames: eligible.length,
    withDuration: summary.games,
    unavailable: eligible.length - summary.games,
    dailyExcluded: games.filter((g) => g.timeClass === "daily").length,
    exactHeaderDuration: known.filter(
      ({ record }) => record.source === "pgn_start_end",
    ).length,
    reconstructedFromClock: known.filter(
      ({ record }) => record.source === "clock_reconstruction",
    ).length,
    emtDuration: known.filter(({ record }) => record.source === "emt").length,
    coverage: summary.coverage,
    totalRecordedSeconds: summary.durationSeconds,
    averageDurationSeconds: summary.averageDurationSeconds,
    byControl,
    byDay,
    byMonth,
    distribution,
    longestGames,
    highlights: {
      mostTimeDay: maxBy(
        byDay.filter((d) => d.games > 0),
        (d) => d.durationSeconds,
      ),
      mostGamesDay: maxBy(byDay, (d) => d.eligibleGames),
      mostTimeMonth: maxBy(
        byMonth.filter((d) => d.games > 0),
        (d) => d.durationSeconds,
      ),
      longestGame: longestGames[0] ?? null,
    },
  };
}
export interface PlaySession {
  id: string;
  startTimestamp: number;
  endTimestamp: number;
  durationSeconds: number;
  recordedSeconds: number;
  gameIds: string[];
  games: number;
  wins: number;
  draws: number;
  losses: number;
  ratingChangeByPool: Partial<Record<TimeClass, number>>;
  timeControls: string[];
}
export interface SessionAnalytics {
  eligibleGames: number;
  withIntervals: number;
  coverage: number;
  sessionGapMinutes: number;
  sessions: PlaySession[];
  totalSessions: number;
  averageSessionSeconds: number | null;
  averageGamesPerSession: number | null;
  longestSession: PlaySession | null;
  maxGamesPerSession: number | null;
  averageRatingChangeByPool: Partial<Record<TimeClass, number>>;
  distribution: { label: string; count: number }[];
  performanceByGameNumber: {
    gameNumber: number;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
  }[];
}
export function sessionAnalytics(
  games: NormalizedGame[],
  records: GameDurationRecord[],
  gapMinutes = SESSION_GAP_MINUTES,
  allGames: NormalizedGame[] = games,
): SessionAnalytics {
  const gap =
    Number.isFinite(gapMinutes) && gapMinutes >= 0
      ? gapMinutes
      : SESSION_GAP_MINUTES;
  const eligible = games.filter(eligibleForPlayTime),
    mapped = recordMap(eligible, records),
    deltas = observedDeltas(allGames);
  const previousObservation = new Map<string, string>();
  const previousPool = new Map<TimeClass, string>();
  for (const g of [...allGames].sort(
    (a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id),
  )) {
    if (!g.rated || g.playerRating === null || g.rules !== "chess") continue;
    const previous = previousPool.get(g.timeClass);
    if (previous) previousObservation.set(g.id, previous);
    previousPool.set(g.timeClass, g.id);
  }
  const interval = (g: NormalizedGame) => {
    const r = mapped.get(g.id);
    return r?.source === "pgn_start_end" &&
      r.startTimestamp !== null &&
      r.endTimestamp !== null &&
      Number.isFinite(r.startTimestamp) &&
      Number.isFinite(r.endTimestamp) &&
      r.endTimestamp > r.startTimestamp &&
      r.durationSeconds !== null
      ? r
      : null;
  };
  const known = eligible
    .filter((g) => interval(g))
    .sort(
      (a, b) =>
        interval(a)!.startTimestamp! - interval(b)!.startTimestamp! ||
        a.id.localeCompare(b.id),
    );
  const unknownEnds = eligible
    .filter((g) => !interval(g))
    .map((g) => g.endTime * 1000)
    .sort((a, b) => a - b);
  const sessions: PlaySession[] = [];
  const performance: SessionAnalytics["performanceByGameNumber"] = [];
  let unknownIndex = 0;
  for (const game of known) {
    const r = interval(game)!,
      previous = sessions.at(-1);
    while (
      previous &&
      unknownIndex < unknownEnds.length &&
      unknownEnds[unknownIndex] <= previous.endTimestamp
    )
      unknownIndex++;
    const unknownBetween =
      previous &&
      unknownIndex < unknownEnds.length &&
      unknownEnds[unknownIndex] <= r.startTimestamp!;
    let session = previous;
    // Missing interval games could bridge/split the apparent gap, so never join across them.
    if (
      !session ||
      unknownBetween ||
      r.startTimestamp! - session.endTimestamp > gap * 60_000
    ) {
      session = {
        id: `session:${game.id}`,
        startTimestamp: r.startTimestamp!,
        endTimestamp: r.endTimestamp!,
        durationSeconds: 0,
        recordedSeconds: 0,
        gameIds: [],
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        ratingChangeByPool: {},
        timeControls: [],
      };
      sessions.push(session);
    }
    session.endTimestamp = Math.max(session.endTimestamp, r.endTimestamp!);
    session.durationSeconds =
      (session.endTimestamp - session.startTimestamp) / 1000;
    session.recordedSeconds += r.durationSeconds!;
    session.gameIds.push(game.id);
    session.games++;
    const resultKey =
      game.result === "win"
        ? "wins"
        : game.result === "draw"
          ? "draws"
          : "losses";
    session[resultKey]++;
    if (!session.timeControls.includes(game.timeClass))
      session.timeControls.push(game.timeClass);
    const delta = deltas.get(game.id);
    // Rating snapshots do not expose a session's initial pregame rating.
    // Include only adjacent pool observations both belonging to this session.
    if (
      delta !== undefined &&
      session.gameIds.includes(previousObservation.get(game.id) ?? "")
    )
      session.ratingChangeByPool[game.timeClass] =
        (session.ratingChangeByPool[game.timeClass] ?? 0) + delta;
    // Keep small samples readable: positions seven and later share one bucket.
    const gameNumber = Math.min(session.games, 7);
    const index = gameNumber - 1;
    performance[index] ??= {
      gameNumber,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
    };
    performance[index].games++;
    performance[index][resultKey]++;
  }
  for (const row of performance) row.winRate = row.wins / row.games;
  const ratingPools = new Map<TimeClass, number[]>();
  for (const s of sessions)
    for (const [pool, value] of Object.entries(s.ratingChangeByPool)) {
      const values = ratingPools.get(pool as TimeClass) ?? [];
      values.push(value);
      ratingPools.set(pool as TimeClass, values);
    }
  const limits = [900, 1800, 3600, 7200, Infinity],
    labels = ["<15m", "15–30m", "30–60m", "1–2h", "2h+"];
  return {
    eligibleGames: eligible.length,
    withIntervals: known.length,
    coverage: eligible.length ? known.length / eligible.length : 0,
    sessionGapMinutes: gap,
    sessions,
    totalSessions: sessions.length,
    averageSessionSeconds: sessions.length
      ? sessions.reduce((sum, s) => sum + s.durationSeconds, 0) /
        sessions.length
      : null,
    averageGamesPerSession: sessions.length
      ? known.length / sessions.length
      : null,
    longestSession: maxBy(sessions, (s) => s.durationSeconds),
    maxGamesPerSession: sessions.length
      ? Math.max(...sessions.map((s) => s.games))
      : null,
    averageRatingChangeByPool: Object.fromEntries(
      [...ratingPools].map(([pool, values]) => [
        pool,
        values.reduce((sum, v) => sum + v, 0) / values.length,
      ]),
    ),
    distribution: limits.map((limit, i) => ({
      label: labels[i],
      count: sessions.filter(
        (s) =>
          s.durationSeconds >= (i ? limits[i - 1] : 0) &&
          s.durationSeconds < limit,
      ).length,
    })),
    performanceByGameNumber: performance,
  };
}
