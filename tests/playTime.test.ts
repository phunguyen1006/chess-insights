import { describe, expect, it } from "vitest";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  parseGameDuration,
  MIN_DURATION_CLOCK_COVERAGE,
} from "../src/analysis/playTime";
import { playTimeSummary, sessionAnalytics } from "../src/analytics/playTime";
import type { NormalizedGame } from "../src/shared/types";

const pgn = (headers: string, moves = "1. e4 e5 2. Nf3 Nc6") =>
  `${headers}\n[Result "1-0"]\n\n${moves} 1-0`;
const game = (
  headers = "",
  overrides: Partial<NormalizedGame> = {},
  moves?: string,
): NormalizedGame => ({
  ...normalizeGame(
    {
      uuid: "duration",
      end_time: Date.parse("2026-10-02T12:10:00Z") / 1000,
      time_class: "rapid",
      time_control: "600",
      rated: true,
      rules: "chess",
      white: { username: "alice", result: "win", rating: 1000 },
      black: { username: "bob", result: "resigned", rating: 1100 },
      pgn: pgn(headers, moves),
    },
    "alice",
  )!,
  ...overrides,
});
const headers =
  '[Date "2026.10.02"]\n[StartTime "12:00:00"]\n[EndDate "2026.10.02"]\n[EndTime "12:10:00"]';
const clocks =
  "1. e4 {[%clk 0:00:58]} e5 {[%clk 0:00:57]} 2. Nf3 {[%clk 0:00:54]} Nc6 {[%clk 0:00:50]}";

describe("Observed game duration", () => {
  it("uses exact Date/StartTime and EndDate/EndTime in milliseconds", () => {
    expect(parseGameDuration(game(headers))).toMatchObject({
      source: "pgn_start_end",
      confidence: "exact",
      durationSeconds: 600,
      startTimestamp: Date.parse("2026-10-02T12:00:00Z"),
      endTimestamp: Date.parse("2026-10-02T12:10:00Z"),
      parserVersion: 1,
    });
  });
  it("prefers UTCDate/UTCTime to ambiguous local Date/StartTime", () => {
    const h = headers + '\n[UTCDate "2026.10.02"]\n[UTCTime "12:03:00"]';
    expect(parseGameDuration(game(h)).durationSeconds).toBe(420);
  });
  it("respects numeric PGN timezone offsets and explicit offsets on times", () => {
    const local =
      headers.replace("12:00:00", "19:00:00").replace("12:10:00", "19:10:00") +
      '\n[TimeZone "+07:00"]';
    expect(parseGameDuration(game(local)).startTimestamp).toBe(
      Date.parse("2026-10-02T12:00:00Z"),
    );
    expect(
      parseGameDuration(
        game(
          headers
            .replaceAll('00:00"', '00:00-0400"')
            .replace('10:00"', '10:00-0400"'),
        ),
      ).startTimestamp,
    ).toBe(Date.parse("2026-10-02T16:00:00Z"));
  });
  it("handles an explicit midnight EndDate and implicit next-day EndTime", () => {
    const h =
      '[UTCDate "2026.10.02"]\n[UTCTime "23:59:50"]\n[EndTime "00:01:10"]';
    expect(parseGameDuration(game(h)).durationSeconds).toBe(80);
    expect(
      parseGameDuration(game(h + '\n[EndDate "2026.10.03"]')).endTimestamp,
    ).toBe(Date.parse("2026-10-03T00:01:10Z"));
  });
  it.each([
    headers.replace("12:10:00", "11:59:00"),
    headers.replace("2026.10.02", "2026.02.31"),
    headers.replace("12:00:00", "25:00:00"),
    headers + '\n[TimeZone "ambiguous"]',
    headers.replace("12:10:00", "22:10:00"),
  ])("rejects invalid, negative or absurd observed intervals", (h) => {
    expect(parseGameDuration(game(h)).durationSeconds).toBeNull();
  });
  it("rejects multi-hour Bullet intervals", () => {
    expect(
      parseGameDuration(
        game(headers.replace("12:10:00", "14:10:00"), { timeClass: "bullet" }),
      ),
    ).toMatchObject({ source: "unavailable", durationSeconds: null });
  });
  it("reconstructs both players' increment clocks and does not fabricate timestamps", () => {
    expect(
      parseGameDuration(game("", { timeControl: "60+1" }, clocks)),
    ).toMatchObject({
      source: "clock_reconstruction",
      confidence: "derived",
      durationSeconds: 20,
      startTimestamp: null,
      endTimestamp: null,
      clockCoverage: 1,
    });
  });
  it("allows premoves and tiny rounding increases without negative time", () => {
    const moves =
      "1. e4 {[%clk 0:01:00.2]} e5 {[%clk 0:00:59]} 2. Nf3 {[%clk 0:00:59]} Nc6 {[%clk 0:00:57]}";
    expect(
      parseGameDuration(game("", { timeControl: "60" }, moves)).durationSeconds,
    ).toBe(4);
  });
  it("does not count a partial clock sequence or missing last clock as complete", () => {
    expect(
      parseGameDuration(
        game(
          "",
          { timeControl: "60+1" },
          clocks.replace("{[%clk 0:00:54]}", ""),
        ),
      ).durationSeconds,
    ).toBeNull();
    const long = Array.from(
      { length: 20 },
      (_, i) =>
        `${i + 1}. ${i % 2 ? "Ng1" : "Nf3"} {[%clk 0:04:${String(59 - i).padStart(2, "0")}]} ${i % 2 ? "Ng8" : "Nf6"} {[%clk 0:04:${String(59 - i).padStart(2, "0")}]}`,
    ).join(" ");
    const complete = parseGameDuration(game("", { timeControl: "300" }, long));
    expect(complete.durationSeconds).toBe(40);
    const gap = parseGameDuration(
      game("", { timeControl: "300" }, long.replace("{[%clk 0:04:50]}", "")),
    );
    expect(gap.clockCoverage).toBe(MIN_DURATION_CLOCK_COVERAGE);
    expect(gap.durationSeconds).toBe(40); // Final clocks recover the internal gap.
    expect(
      parseGameDuration(
        game(
          "",
          { timeControl: "300" },
          long.replace(/\{\[%clk 0:04:40\]\}\s*$/, ""),
        ),
      ).durationSeconds,
    ).toBeNull();
  });
  it("sums complete EMT seconds and colon formats, but rejects missing/invalid EMT", () => {
    const emt =
      "1. e4 {[%emt 1.5]} e5 {[%emt 0:02.5]} 2. Nf3 {[%emt 0:00:03]} Nc6 {[%emt 4]}";
    expect(parseGameDuration(game("", {}, emt))).toMatchObject({
      source: "emt",
      durationSeconds: 11,
      startTimestamp: null,
    });
    expect(
      parseGameDuration(game("", {}, emt.replace("{[%emt 4]}", "")))
        .durationSeconds,
    ).toBeNull();
    expect(
      parseGameDuration(game("", {}, emt.replace("0:02.5", "0:62")))
        .durationSeconds,
    ).toBeNull();
  });
  it("keeps header priority when clock differences are small and flags strong mismatch", () => {
    const short = headers.replace("12:10:00", "12:00:25");
    expect(
      parseGameDuration(game(short, { timeControl: "60+1" }, clocks)).source,
    ).toBe("pgn_start_end");
    expect(
      parseGameDuration(game(headers, { timeControl: "60+1" }, clocks)),
    ).toMatchObject({
      source: "unavailable",
      reason: "inconsistent_duration_sources",
    });
  });
  it("never estimates Daily, unknown games, missing PGNs or unfinished games", () => {
    expect(
      parseGameDuration(game(headers, { timeClass: "daily" })).reason,
    ).toBe("daily_excluded");
    expect(
      parseGameDuration(game(headers, { timeClass: "unknown" }))
        .durationSeconds,
    ).toBeNull();
    expect(
      parseGameDuration(game("", { pgn: null })).durationSeconds,
    ).toBeNull();
    expect(
      parseGameDuration(game("", { pgn: pgn(headers).replaceAll("1-0", "*") }))
        .durationSeconds,
    ).toBeNull();
  });
});

describe("Play Time summaries and sessions", () => {
  const timed = (
    id: string,
    start: string,
    end: string,
    overrides: Partial<NormalizedGame> = {},
  ) =>
    game(
      `[UTCDate "${start.slice(0, 10).replaceAll("-", ".")}"]\n[UTCTime "${start.slice(11, 19)}"]\n[EndDate "${end.slice(0, 10).replaceAll("-", ".")}"]\n[EndTime "${end.slice(11, 19)}"]`,
      {
        id,
        endTime: Date.parse(end) / 1000,
        localDate: end.slice(0, 10),
        ...overrides,
      },
    );
  it("shows eligible coverage, excludes Daily, and averages only known durations", () => {
    const list = [
      timed("a", "2026-10-02T12:00:00Z", "2026-10-02T12:10:00Z"),
      timed("b", "2026-10-02T13:00:00Z", "2026-10-02T13:05:00Z", {
        timeClass: "blitz",
      }),
      game("", { id: "missing" }),
      game(headers, { id: "daily", timeClass: "daily" }),
    ];
    const result = playTimeSummary(list, list.map(parseGameDuration));
    expect(result).toMatchObject({
      selectedGames: 4,
      eligibleRealtimeGames: 3,
      withDuration: 2,
      unavailable: 1,
      dailyExcluded: 1,
      coverage: 2 / 3,
      totalRecordedSeconds: 900,
      averageDurationSeconds: 450,
    });
    expect(result.byControl[1]).toMatchObject({
      pool: "blitz",
      durationSeconds: 300,
      averageDurationSeconds: 300,
      coverage: 1,
      share: 1 / 3,
    });
    expect(result.distribution.find((r) => r.label === "5–10 min")?.count).toBe(
      1,
    );
    expect(result.highlights.longestGame?.game.id).toBe("a");
    expect(
      playTimeSummary([game("", { pgn: null })], []).averageDurationSeconds,
    ).toBeNull();
  });
  it("groups observed intervals using a strict greater-than30-minute gap", () => {
    const list = [
      timed("a", "2026-10-02T12:00:00Z", "2026-10-02T12:10:00Z", {
        playerRating: 1000,
      }),
      timed("b", "2026-10-02T12:40:00Z", "2026-10-02T12:45:00Z", {
        playerRating: 1010,
        result: "loss",
      }),
      timed("c", "2026-10-02T13:15:01Z", "2026-10-02T13:20:01Z", {
        playerRating: 1015,
      }),
    ];
    const result = sessionAnalytics(list, list.map(parseGameDuration));
    expect(result).toMatchObject({
      withIntervals: 3,
      coverage: 1,
      totalSessions: 2,
      maxGamesPerSession: 2,
      averageGamesPerSession: 1.5,
    });
    expect(result.sessions[0]).toMatchObject({
      gameIds: ["a", "b"],
      durationSeconds: 2700,
      recordedSeconds: 900,
      wins: 1,
      losses: 1,
      ratingChangeByPool: { rapid: 10 },
    });
    expect(result.performanceByGameNumber[1]).toMatchObject({
      gameNumber: 2,
      games: 1,
      winRate: 0,
    });
    expect(result.averageRatingChangeByPool.rapid).toBe(10);
  });
  it("splits across unknown interval games and refuses inferred clock-only chronology", () => {
    const list = [
      timed("a", "2026-10-02T12:00:00Z", "2026-10-02T12:10:00Z"),
      game(
        "",
        {
          id: "clock",
          timeControl: "60+1",
          endTime: Date.parse("2026-10-02T12:15:00Z") / 1000,
        },
        clocks,
      ),
      timed("b", "2026-10-02T12:20:00Z", "2026-10-02T12:25:00Z"),
    ];
    expect(playTimeSummary(list, list.map(parseGameDuration)).coverage).toBe(1);
    expect(sessionAnalytics(list, list.map(parseGameDuration))).toMatchObject({
      eligibleGames: 3,
      withIntervals: 2,
      coverage: 2 / 3,
      totalSessions: 2,
    });
  });
  it("keeps rating pools separate, rejects stale versions, and returns honest empty statistics", () => {
    const empty = sessionAnalytics([], []);
    expect(empty).toMatchObject({
      eligibleGames: 0,
      coverage: 0,
      totalSessions: 0,
      averageSessionSeconds: null,
      longestSession: null,
    });
    const g = timed("a", "2026-10-02T12:00:00Z", "2026-10-02T12:10:00Z");
    expect(
      playTimeSummary([g], [{ ...parseGameDuration(g), parserVersion: 0 }])
        .withDuration,
    ).toBe(0);
    expect(
      playTimeSummary(
        [{ ...g, pgn: g.pgn!.replace("12:10:00", "12:15:00") }],
        [parseGameDuration(g)],
      ).withDuration,
    ).toBe(0);
  });
  it("does not attribute rating movement across excluded observations or combine pools", () => {
    const all = [
      timed("a", "2026-10-02T12:00:00Z", "2026-10-02T12:05:00Z", {
        playerRating: 1000,
      }),
      timed("hidden", "2026-10-02T12:10:00Z", "2026-10-02T12:15:00Z", {
        playerRating: 1005,
      }),
      timed("c", "2026-10-02T12:20:00Z", "2026-10-02T12:25:00Z", {
        playerRating: 1010,
      }),
      timed("d", "2026-10-02T12:26:00Z", "2026-10-02T12:30:00Z", {
        playerRating: 2200,
        timeClass: "blitz",
      }),
      timed("e", "2026-10-02T12:31:00Z", "2026-10-02T12:35:00Z", {
        playerRating: 2210,
        timeClass: "blitz",
      }),
    ];
    const selected = all.filter((g) => g.id !== "hidden");
    const summary = sessionAnalytics(
      selected,
      all.map(parseGameDuration),
      30,
      all,
    );
    expect(summary.sessions[0].ratingChangeByPool).toEqual({ blitz: 10 });
    expect(summary.averageRatingChangeByPool).toEqual({ blitz: 10 });
  });
  it("groups game positions7and later while preserving the actual observation denominator", () => {
    const list = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(
        Date.parse("2026-10-02T12:00:00Z") + i * 5 * 60_000,
      ).toISOString();
      const end = new Date(Date.parse(start) + 3 * 60_000).toISOString();
      return timed(`position-${i + 1}`, start, end, {
        result: i === 7 ? "loss" : "win",
      });
    });
    const summary = sessionAnalytics(list, list.map(parseGameDuration));
    expect(summary.totalSessions).toBe(1);
    expect(summary.sessions[0].games).toBe(8);
    expect(
      summary.performanceByGameNumber.map((row) => row.gameNumber),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(summary.performanceByGameNumber[6]).toMatchObject({
      gameNumber: 7,
      games: 2,
      wins: 1,
      losses: 1,
      draws: 0,
      winRate: 0.5,
    });
    expect(
      summary.performanceByGameNumber.reduce((sum, row) => sum + row.games, 0),
    ).toBe(8);
  });
});
