import { it, expect } from "vitest";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  monthlySeries,
  performanceGroups,
  terminationDistribution,
  ratingSparklines,
  openingScatter,
  previousPeriod,
  visualSummary,
  opponentBuckets,
} from "../src/analytics/visuals";
import { ratingDrawdown } from "../src/analytics/ratings";
import { defaultFilters } from "../src/analytics/results";
import type { NormalizedGame } from "../src/shared/types";
const make = (patch: Partial<NormalizedGame> = {}): NormalizedGame => ({
  ...normalizeGame(
    {
      uuid: "sample",
      end_time: 1767322800,
      time_class: "rapid",
      rated: true,
      rules: "chess",
      white: { username: "alice", rating: 1000, result: "win" },
      black: { username: "bob", rating: 1200, result: "resigned" },
      pgn: '[ECO "C50"]\n[Opening "Italian Game"]',
    },
    "alice",
  )!,
  localDate: "2026-01-02",
  ...patch,
});
it("aggregates monthly games, distinct active days, win rates and timeout losses", () => {
  const m = monthlySeries([
    make(),
    make({ id: "b", result: "loss", termination: "Timeout" }),
    make({ id: "c", localDate: "2026-03-01", result: "draw" }),
  ]);
  expect(m.map((r) => [r.month, r.games, r.activeDays, r.winRate])).toEqual([
    ["2026-01", 2, 1, 50],
    ["2026-02", 0, 0, 0],
    ["2026-03", 1, 1, 0],
  ]);
  expect(m[0].timeoutLossRate).toBe(50);
});
it("keeps WDL counts and distribution grouped by pool and color", () => {
  const games = [
    make(),
    make({ timeClass: "daily", playerColor: "black", result: "draw" }),
    make({ result: "loss" }),
  ];
  expect(performanceGroups(games, "pool")[0]).toMatchObject({
    games: 2,
    wins: 1,
    losses: 1,
    winRate: 50,
  });
  expect(performanceGroups(games, "color")[1]).toMatchObject({
    games: 1,
    draws: 1,
  });
});
it("keeps rating sparklines rated and pool-specific and computes running drawdown", () => {
  const games = [
    make({ endTime: 1, playerRating: 1100 }),
    make({ endTime: 2, playerRating: 1200 }),
    make({ endTime: 3, playerRating: 1150 }),
    make({ rated: false, playerRating: 9000 }),
    make({ timeClass: "daily", playerRating: 1400 }),
  ];
  expect(ratingSparklines(games)[0].series.map((d) => d.value)).toEqual([
    1100, 1200, 1150,
  ]);
  expect(ratingSparklines(games)[3].series[0].value).toBe(1400);
  expect(ratingDrawdown(games, "rapid").map((d) => d.value)).toEqual([
    0, 0, -50,
  ]);
});
it("includes opening scatter only at minimum sample size and separates colors", () => {
  const games = Array.from({ length: 10 }, (_, i) => make({ id: String(i) }));
  expect(openingScatter(games.slice(0, 9))).toEqual([]);
  expect(
    openingScatter([...games, make({ playerColor: "black" })]),
  ).toHaveLength(1);
  expect(openingScatter(games)[0]).toMatchObject({ x: 10, y: 100 });
});
it("counts terminations per outcome and buckets observed opponent ratings", () => {
  const games = [
    make(),
    make({ result: "loss", termination: "Timeout" }),
    make({ result: "draw", termination: "Stalemate", opponentRating: null }),
  ];
  expect(terminationDistribution(games, "loss")).toEqual([
    { label: "Timeout", value: 1 },
  ]);
  expect(terminationDistribution(games, "draw")).toEqual([
    { label: "Stalemate", value: 1 },
  ]);
  expect(opponentBuckets(games)[0]).toMatchObject({
    label: "1200–1399",
    games: 2,
  });
});
it("compares equal adjacent date periods in percentage points with identical filters", () => {
  const games = [
    make({ localDate: "2026-01-01", result: "loss" }),
    make({ localDate: "2026-01-02" }),
    make({ localDate: "2026-01-02", timeClass: "daily", result: "loss" }),
  ];
  expect(
    previousPeriod(games, {
      ...defaultFilters,
      timeClass: "rapid",
      start: "2026-01-02",
      end: "2026-01-02",
    }),
  ).toMatchObject({
    start: "2026-01-01",
    end: "2026-01-01",
    gamesChange: 0,
    winRatePoints: 100,
  });
  expect(
    previousPeriod([], {
      ...defaultFilters,
      start: "2026-01-02",
      end: "2026-01-02",
    })?.winRatePoints,
  ).toBeNull();
});
it("reuses immutable summary objects and has honest empty outputs", () => {
  const games: NormalizedGame[] = [];
  expect(visualSummary(games)).toBe(visualSummary(games));
  expect(monthlySeries(games)).toEqual([]);
  expect(ratingSparklines(games).every((p) => !p.series.length)).toBe(true);
});
