import { describe, expect, it } from "vitest";
import {
  LIFE_REVIEW_RANGES,
  buildLifeReview,
  lifeCalendarDays,
  lifeRating,
  resolveLifeRange,
  sanitizeLifeGames,
} from "../src/analytics/lifeReviewMetrics";
import {
  durationFingerprint,
  type GameDurationRecord,
} from "../src/analysis/playTime";
import type { NormalizedGame } from "../src/shared/types";
import { buildLifeEvidence } from "../src/analytics/lifeReviewInsights";

const at = (date: string, hour = 12, minute = 0) =>
  new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
  );
function game(
  id: string,
  date: string,
  hour: number,
  rating: number,
  result: NormalizedGame["result"] = "win",
  overrides: Partial<NormalizedGame> = {},
): NormalizedGame {
  return {
    id,
    url: `https://www.chess.com/game/live/${id}`,
    username: "alice",
    endTime: at(date, hour).getTime() / 1000,
    localDate: date,
    timeClass: "rapid",
    timeControl: "600",
    rated: true,
    rules: "chess",
    playerColor: "white",
    result,
    rawPlayerResult:
      result === "win" ? "win" : result === "draw" ? "agreed" : "resigned",
    rawOpponentResult: result === "loss" ? "win" : "resigned",
    termination: "Resignation",
    playerRating: rating,
    opponentRating: 1100,
    opponentUsername: "bob",
    whiteUsername: "alice",
    blackUsername: "bob",
    whiteRating: rating,
    blackRating: 1100,
    eco: "C50",
    openingName: "Italian Game",
    variation: null,
    pgn: null,
    ...overrides,
  };
}
function duration(
  g: NormalizedGame,
  seconds: number,
  exact = true,
): GameDurationRecord {
  return {
    id: g.id,
    username: g.username,
    durationSeconds: seconds,
    startTimestamp: exact ? g.endTime * 1000 - seconds * 1000 : null,
    endTimestamp: exact ? g.endTime * 1000 : null,
    source: exact ? "pgn_start_end" : "clock_reconstruction",
    confidence: exact ? "exact" : "derived",
    parserVersion: 1,
    fingerprint: durationFingerprint(g),
  };
}
const now = at("2026-10-04", 12);

describe("Life Review local ranges", () => {
  it("offers all nine requested ranges", () => {
    expect(LIFE_REVIEW_RANGES.map(([key]) => key)).toEqual([
      "week",
      "month",
      "lastMonth",
      "30days",
      "quarter",
      "year",
      "lastYear",
      "all",
      "custom",
    ]);
  });
  it.each([
    ["week", "2026-09-28", "2026-10-04", "2026-09-21", "2026-09-27"],
    ["month", "2026-10-01", "2026-10-04", "2026-09-01", "2026-09-04"],
    ["quarter", "2026-10-01", "2026-10-04", "2026-07-01", "2026-07-04"],
    ["year", "2026-01-01", "2026-10-04", "2025-01-01", "2025-10-04"],
    ["lastMonth", "2026-09-01", "2026-09-30", "2026-08-01", "2026-08-31"],
    ["lastYear", "2025-01-01", "2025-12-31", "2024-01-01", "2024-12-31"],
    ["30days", "2026-09-05", "2026-10-04", "2026-08-06", "2026-09-04"],
  ] as const)(
    "resolves %s with inclusive local dates",
    (key, start, end, previousStart, previousEnd) => {
      const range = resolveLifeRange(key, now);
      expect([
        range.start,
        range.end,
        range.previous?.start,
        range.previous?.end,
      ]).toEqual([start, end, previousStart, previousEnd]);
    },
  );
  it("caps a matched March period at February's real end and completes its shorter prior period", () => {
    const range = resolveLifeRange("month", at("2026-03-31", 15));
    expect(range.previous).toMatchObject({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(range.previous?.endExclusiveMs).toBe(at("2026-03-01", 0).getTime());
  });
  it("counts civil days through leap days and DST boundaries without 24h arithmetic", () => {
    expect(lifeCalendarDays("2024-02-28", "2024-03-01")).toBe(3);
    expect(lifeCalendarDays("2026-03-07", "2026-03-09")).toBe(3);
    expect(lifeCalendarDays("2026-10-31", "2026-11-02")).toBe(3);
    expect(resolveLifeRange("year", at("2024-03-01")).previous?.end).toBe(
      "2023-03-02",
    );
  });
  it("validates custom dates, caps future ends, and compares equal adjacent spans", () => {
    expect(
      resolveLifeRange("custom", now, "2026-02-31", "2026-03-03").error,
    ).toBeTruthy();
    expect(
      resolveLifeRange("custom", now, "2026-10-03", "2026-10-01").error,
    ).toBeTruthy();
    expect(
      resolveLifeRange("custom", now, "2026-10-05", "2026-10-09").error,
    ).toBeTruthy();
    const range = resolveLifeRange("custom", now, "2026-10-01", "2026-10-30");
    expect([
      range.start,
      range.end,
      range.previous?.start,
      range.previous?.end,
    ]).toEqual(["2026-10-01", "2026-10-04", "2026-09-27", "2026-09-30"]);
    expect(
      resolveLifeRange("custom", now, "2026-09-01", "2026-09-03").previous,
    ).toMatchObject({ start: "2026-08-29", end: "2026-08-31" });
  });
  it("does not invent a previous period for all-time history", () => {
    expect(
      resolveLifeRange("all", now, undefined, undefined, "2023-04-21"),
    ).toMatchObject({ start: "2023-04-21", end: "2026-10-04", previous: null });
  });
  it("matches the wall clock on the incomplete final day, including local-midnight boundary games", () => {
    const range = resolveLifeRange("month", now);
    const games = [
      game("old-early", "2026-09-04", 11, 900),
      game("old-late", "2026-09-04", 13, 910),
      game("midnight", "2026-10-01", 0, 1000),
      game("current", "2026-10-04", 11, 1010),
      game("future-skew", "2026-10-04", 12, 1015, "win", {
        endTime: now.getTime() / 1000 + 30,
      }),
    ];
    const review = buildLifeReview(games, range);
    expect(review.games.map((g) => g.id)).toEqual(["midnight", "current"]);
    expect(review.previousGames.map((g) => g.id)).toEqual(["old-early"]);
  });
  it("recomputes dates in UTC, Saigon, New York, and Auckland from the same real completion timestamp", () => {
    const originalZone = process.env.TZ;
    const originalEffectiveZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      for (const [zone, expectedDate, expectedHour, included] of [
        ["UTC", "2026-03-01", 0, true],
        ["Asia/Saigon", "2026-03-01", 7, true],
        ["America/New_York", "2026-02-28", 19, false],
        ["Pacific/Auckland", "2026-03-01", 13, true],
      ] as const) {
        process.env.TZ = zone;
        const endTime = Date.parse("2026-03-01T00:30:00Z") / 1000;
        const g = game("zone", "2026-03-01", 12, 1000, "win", {
          endTime,
          localDate: "wrong",
        });
        const asOf = new Date("2026-03-08T12:00:00Z");
        expect(sanitizeLifeGames([g], asOf.getTime())[0].localDate).toBe(
          expectedDate,
        );
        const summary = buildLifeReview(
          [g],
          resolveLifeRange("custom", asOf, "2026-03-01", "2026-03-01"),
        ).current;
        expect(summary.games).toBe(included ? 1 : 0);
        expect(summary.hours[expectedHour].games).toBe(included ? 1 : 0);
        // New York crosses its spring DST boundary within this local date span.
        expect(lifeCalendarDays("2026-03-07", "2026-03-09")).toBe(3);
      }
    } finally {
      if (originalZone === undefined) {
        process.env.TZ = originalEffectiveZone;
        delete process.env.TZ;
      } else process.env.TZ = originalZone;
    }
  });
});

describe("Life Review evidence aggregation", () => {
  const games = [
    game("a", "2026-10-01", 10, 1000),
    game("b", "2026-10-01", 10, 1010, "win", {
      endTime: at("2026-10-01", 10, 40).getTime() / 1000,
    }),
    game("c", "2026-10-01", 12, 1005, "draw"),
    game("d", "2026-10-03", 8, 1020, "loss"),
    game("e", "2026-10-03", 9, 1015, "loss"),
    game("f", "2026-10-03", 10, 1300, "win", { timeClass: "daily" }),
  ];
  const records = [
    duration(games[0], 600),
    duration(games[1], 600),
    duration(games[2], 300, false),
    duration(games[3], 300),
  ];
  it("sanitizes variants, malformed completions, duplicates, and stale stored local dates", () => {
    const valid = game("valid", "2026-10-01", 10, 1000, "win", {
      localDate: "1900-01-01",
    });
    const normalized = sanitizeLifeGames(
      [
        valid,
        valid,
        { ...valid, id: "future", endTime: now.getTime() / 1000 + 100 },
        { ...valid, id: "variant", rules: "chess960" },
        { ...valid, id: "bad", endTime: NaN },
        {
          ...valid,
          id: "unfinished",
          result: "unknown" as NormalizedGame["result"],
        },
      ],
      now.getTime(),
    );
    expect(normalized).toHaveLength(1);
    expect(normalized[0].localDate).toBe("2026-10-01");
    expect(valid.localDate).toBe("1900-01-01");
  });
  it("counts results, zero-activity calendar days, true streaks, and population variance", () => {
    const review = buildLifeReview(
      games,
      resolveLifeRange("month", now),
      records,
    );
    expect(review.current).toMatchObject({
      games: 6,
      wins: 3,
      draws: 1,
      losses: 2,
      winRate: 50,
      activeDays: 2,
      totalDays: 4,
      longestActiveStreak: 1,
      longestInactiveGap: 1,
      medianGamesPerActiveDay: 3,
      varianceGamesPerDay: 2.25,
    });
    expect(review.current.days.map((day) => day.games)).toEqual([3, 0, 3, 0]);
    expect(review.current.streaks.win).toMatchObject({ length: 2 });
    expect(review.current.streaks.win.games.map((g) => g.id)).toEqual([
      "a",
      "b",
    ]);
    expect(review.current.streaks.unbeaten.length).toBe(3);
    expect(review.current.streaks.loss.length).toBe(2);
  });
  it("reuses real recorded durations and the existing exact-interval session rules", () => {
    const review = buildLifeReview(
      games,
      resolveLifeRange("month", now),
      records,
    );
    expect(review.current.time).toMatchObject({
      totalRecordedSeconds: 1800,
      eligibleRealtimeGames: 5,
      withDuration: 4,
      coverage: 0.8,
      dailyExcluded: 1,
    });
    expect(review.current.sessions).toMatchObject({
      totalSessions: 2,
      withIntervals: 3,
      coverage: 0.6,
      averageSessionSeconds: 1650,
      averageGamesPerSession: 1.5,
    });
    expect(review.current.sessions.sessions[0]).toMatchObject({
      gameIds: ["a", "b"],
      durationSeconds: 3000,
      recordedSeconds: 1200,
    });
    expect(review.current.medianSessionSeconds).toBe(1650);
    expect(review.current.sessionBins.map((row) => row.count)).toEqual([
      1, 0, 1, 0, 0,
    ]);
    expect(review.current.days.map((day) => day.seconds)).toEqual([
      1500,
      null,
      300,
      null,
    ]);
    // Oct 3 has an unknown real-time game and is excluded: [1500, 0, 0].
    expect(review.current.varianceSecondsPerDay).toBe(500000);
  });
  it("rejects stale duration metadata and never calls Daily time or missing duration zero playing time", () => {
    const stale = records.map((record) => ({ ...record, parserVersion: 0 }));
    const review = buildLifeReview(
      games,
      resolveLifeRange("month", now),
      stale,
    );
    expect(review.current.time.withDuration).toBe(0);
    expect(review.current.varianceSecondsPerDay).toBeNull();
    expect(review.current.days.every((day) => day.seconds === null)).toBe(true);
    expect(
      review.current.hourCells.every((cell) => cell.seconds === null),
    ).toBe(true);
  });
  it("excludes active days with unknown or partial durations from recorded-time variance", () => {
    const selected = [
      game("known", "2026-10-01", 10, 1000),
      game("unknown", "2026-10-02", 10, 1010),
    ];
    const review = buildLifeReview(
      selected,
      resolveLifeRange("custom", now, "2026-10-01", "2026-10-03"),
      [duration(selected[0], 600)],
    );
    // Known Oct 1 =600; unknown active Oct 2 excluded; inactive Oct 3 =0.
    expect(review.current.varianceSecondsPerDay).toBe(90000);
  });
  it("indexes weekday/hour completion groups with duration coverage and fills all 168 cells", () => {
    const summary = buildLifeReview(
      games,
      resolveLifeRange("month", now),
      records,
    ).current;
    expect(summary.hourCells).toHaveLength(168);
    // October 1, 2026 is Thursday: Monday-first weekday index 3.
    expect(
      summary.hourCells.find((cell) => cell.weekday === 3 && cell.hour === 10),
    ).toMatchObject({ games: 2, seconds: 1200, knownDurations: 2 });
    expect(summary.hours.find((row) => row.hour === 10)?.games).toBe(3);
    expect(summary.weekday.map((row) => row.games)).toEqual([
      0, 0, 0, 3, 0, 3, 0,
    ]);
  });
  it("separates observed rating pools, ignores missing ratings, and computes first-to-last daily movement", () => {
    const review = buildLifeReview(games, resolveLifeRange("month", now));
    expect(review.pool).toBe("rapid");
    expect(review.rating).toMatchObject({
      start: 1000,
      end: 1015,
      change: 15,
      high: 1020,
      low: 1000,
      drawdown: -5,
      days: [
        { date: "2026-10-01", change: 5 },
        { date: "2026-10-03", change: -5 },
      ],
      biggestGain: { date: "2026-10-01", change: 5 },
      biggestLoss: { date: "2026-10-03", change: -5 },
    });
    expect(review.rating.points.map((point) => point.change)).toEqual([
      null,
      10,
      -5,
      15,
      -5,
    ]);
    expect(
      lifeRating([games[0], { ...games[1], playerRating: null }], "rapid"),
    ).toMatchObject({ start: 1000, end: 1000, change: null, days: [] });
    expect(lifeRating(games, "daily")).toMatchObject({
      start: 1300,
      end: 1300,
      change: null,
    });
  });
  it("aggregates real monthly recorded time and rating observations without a fabricated final-game delta", () => {
    const summary = buildLifeReview(
      games,
      resolveLifeRange("month", now),
      records,
    ).current;
    expect(summary.monthly).toEqual([
      {
        month: "2026-10",
        games: 6,
        winRate: 50,
        seconds: 1800,
        rating: 1015,
        change: 15,
      },
    ]);
  });
  it("returns honest empty and invalid-range statistics", () => {
    const review = buildLifeReview([], resolveLifeRange("month", now));
    expect(review.current).toMatchObject({
      games: 0,
      activeDays: 0,
      totalDays: 4,
      longestInactiveGap: 4,
      medianGamesPerActiveDay: null,
      varianceSecondsPerDay: null,
    });
    expect(review.rating).toMatchObject({
      start: null,
      end: null,
      change: null,
      high: null,
      low: null,
      drawdown: null,
    });
    expect(review.previous?.games).toBe(0);
    const invalid = buildLifeReview(
      games,
      resolveLifeRange("custom", now, "bad", "bad"),
    );
    expect(invalid.games).toEqual([]);
    expect(invalid.previous).toBeNull();
  });
});

describe("Life Review large histories", () => {
  it("keeps long winning runs and thousands of opening groups exact without unbounded streak copying", () => {
    const originalZone = process.env.TZ,
      originalEffectiveZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      process.env.TZ = "UTC";
      const first = Date.UTC(2014, 0, 1) / 1000,
        asOf = new Date("2026-10-04T12:00:00Z"),
        base = game("base", "2014-01-01", 0, 1000);
      const games = Array.from({ length: 50_000 }, (_, index) => ({
        ...base,
        id: `stress-${index}`,
        endTime: first + index * 7200,
        localDate: "stale",
        playerRating: 1000 + (index % 400),
        openingName: `Opening bucket ${index % 5000}`,
      }));
      const review = buildLifeReview(
        games,
        resolveLifeRange("all", asOf, undefined, undefined, "2014-01-01"),
      );
      // Independent civil-calendar count: Jan 1, 2014 through Oct 4, 2026.
      // 50,000 completions every 2 hours end May 29, 2025 at 14:00 UTC.
      expect(review.current).toMatchObject({
        games: 50_000,
        wins: 50_000,
        totalDays: 4660,
        activeDays: 4167,
      });
      expect(review.current.streaks.win.length).toBe(50_000);
      expect(review.current.streaks.unbeaten.length).toBe(50_000);
      expect(review.current.streaks.loss.length).toBe(0);
      expect(review.current.streaks.win.games.at(-1)?.id).toBe("stress-49999");
      expect(review.rating).toMatchObject({
        high: 1399,
        low: 1000,
        start: 1000,
        end: 1399,
        change: 399,
        drawdown: -399,
      });
      expect(review.current.monthly).toHaveLength(154);
      const evidence = buildLifeEvidence(review.games, []);
      expect(evidence.openings).toHaveLength(5000);
      expect(
        evidence.openings.every(
          (row) => row.games === 10 && row.winRate === 100,
        ),
      ).toBe(true);
      expect(evidence.openings.reduce((sum, row) => sum + row.games, 0)).toBe(
        50_000,
      );

      const century = buildLifeReview(
        [],
        resolveLifeRange("custom", asOf, "1900-01-01", "2026-10-04"),
      );
      expect(century.range.error).toBeUndefined();
      expect(century.current.totalDays).toBe(46_298);
      expect(century.previous?.totalDays).toBe(46_298);
      expect(century.range.previous).toMatchObject({
        start: "1773-03-29",
        end: "1899-12-31",
      });
    } finally {
      if (originalZone === undefined) {
        process.env.TZ = originalEffectiveZone;
        delete process.env.TZ;
      } else process.env.TZ = originalZone;
    }
  }, 30_000);
});
