import { describe, it, expect } from "vitest";
import {
  fromUnixLocal,
  localDate,
  calendar,
  addDays,
} from "../src/shared/dates";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  normalizeResult,
  normalizeGameTermination,
} from "../src/data/normalize/normalizeResult";
import {
  activity,
  getHeatmapIntensity,
  activityBreakdown,
} from "../src/analytics/activity";
import { streaks } from "../src/analytics/streaks";
import { filterGames, defaultFilters } from "../src/analytics/results";
import {
  ratingSummary,
  rollingAverage,
  observedDeltas,
} from "../src/analytics/ratings";
import { aggregateOpenings, rankOpenings } from "../src/analytics/openings";
import {
  aggregateOpponents,
  opponentInsights,
} from "../src/analytics/opponents";
import type { NormalizedGame, RawGame } from "../src/shared/types";
export const raw: RawGame = {
  uuid: "one",
  url: "https://www.chess.com/game/live/123",
  end_time: 1767322800,
  time_class: "rapid",
  time_control: "600",
  rated: true,
  rules: "chess",
  white: { username: "Alice", rating: 1000, result: "win" },
  black: { username: "Bob", rating: 1020, result: "resigned" },
  pgn: '[ECO "C50"]\n[Opening "Italian Game"]\n[Variation "Giuoco Piano"]',
};
export const game = (
  overrides: Partial<NormalizedGame> = {},
): NormalizedGame => ({ ...normalizeGame(raw, "alice")!, ...overrides });
describe("Local calendar", () => {
  it("uses browser local date around UTC midnight", () => {
    const date = new Date(2026, 8, 30, 0, 15);
    expect(fromUnixLocal(date.getTime() / 1000)).toBe("2026-09-30");
    expect(localDate(date)).toBe("2026-09-30");
  });
  it("adds calendar days across leap day without UTC assumptions", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
  });
  it.each([2023, 2024, 2026, 2012])(
    "contains each day exactly once in %i",
    (year) => {
      const days = calendar(year).flat().filter(Boolean);
      expect(days.length).toBe(year % 4 === 0 ? 366 : 365);
      expect(new Set(days).size).toBe(days.length);
      expect(days[0]).toBe(`${year}-01-01`);
      expect(days.at(-1)).toBe(`${year}-12-31`);
    },
  );
  it("puts the first partial week in Monday-first rows", () => {
    expect(calendar(2026)[0]).toEqual([
      null,
      null,
      null,
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });
  it("pads the last partial week", () => {
    expect(calendar(2026).at(-1)).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      null,
      null,
      null,
    ]);
  });
  it("handles the rare 54-column leap calendar faithfully", () => {
    expect(calendar(2012).length).toBe(54);
  });
});
describe("Normalization", () => {
  it.each([
    "agreed",
    "repetition",
    "stalemate",
    "insufficient",
    "50move",
    "timevsinsufficient",
  ])("normalizes %s as draw", (code) =>
    expect(normalizeResult(code, code)).toBe("draw"),
  );
  it.each(["checkmated", "resigned", "timeout", "abandoned", "lose"])(
    "normalizes %s as loss",
    (code) => expect(normalizeResult(code, "win")).toBe("loss"),
  );
  it("preserves win and rejects unresolved results", () => {
    expect(normalizeResult("win", "resigned")).toBe("win");
    expect(normalizeResult("unknown", "unknown")).toBeNull();
  });
  it("normalizes reasons and keeps unknown honest", () => {
    expect(normalizeGameTermination("win", "resigned")).toBe("Resignation");
    expect(normalizeGameTermination("timeout", "win")).toBe("Timeout");
    expect(normalizeGameTermination("weird", "weird")).toBe("Other");
  });
  it("detects player color case-insensitively", () => {
    expect(normalizeGame(raw, "ALICE")?.playerColor).toBe("white");
    expect(normalizeGame(raw, "bob")?.playerColor).toBe("black");
    expect(normalizeGame(raw, "carol")).toBeNull();
  });
  it("skips unfinished games and variants", () => {
    expect(normalizeGame({ ...raw, end_time: undefined }, "alice")).toBeNull();
    expect(normalizeGame({ ...raw, rules: "chess960" }, "alice")).toBeNull();
  });
  it("parses supplied tags once and preserves PGN", () => {
    const g = game();
    expect(g.eco).toBe("C50");
    expect(g.openingName).toBe("Italian Game");
    expect(g.variation).toBe("Giuoco Piano");
    expect(g.pgn).toBe(raw.pgn);
  });
  it("uses deterministic fallback identity and isolates accounts", () => {
    const r = { ...raw, uuid: undefined, url: undefined };
    expect(normalizeGame(r, "alice")?.id).toBe(normalizeGame(r, "ALICE")?.id);
    expect(normalizeGame(raw, "alice")?.id).not.toBe(
      normalizeGame(raw, "bob")?.id,
    );
  });
});
describe("Activity", () => {
  const games = [
    game({ localDate: "2026-09-28" }),
    game({ localDate: "2026-09-28" }),
    game({ localDate: "2026-09-29", timeClass: "blitz" }),
  ];
  it("filters time class, color, rated, result and dates", () => {
    expect(
      filterGames(games, { ...defaultFilters, timeClass: "rapid" }),
    ).toHaveLength(2);
    expect(
      filterGames(games, { ...defaultFilters, start: "2026-09-29" }),
    ).toHaveLength(1);
    expect(
      filterGames(games, { ...defaultFilters, rated: "unrated" }),
    ).toHaveLength(0);
    expect(
      filterGames(games, { ...defaultFilters, color: "black" }),
    ).toHaveLength(0);
    expect(
      filterGames(games, { ...defaultFilters, result: "loss" }),
    ).toHaveLength(0);
  });
  it("counts active days and games per active day", () => {
    expect(activity(games, "2026-09-30")).toMatchObject({
      activeDays: 2,
      gamesPerActiveDay: 1.5,
      current: 2,
      longest: 2,
      mostActiveCount: 2,
    });
  });
  it("counts current streak ending today or yesterday", () => {
    expect(streaks(["2026-09-28", "2026-09-29"], "2026-09-30").current).toBe(2);
    expect(
      streaks(["2026-09-28", "2026-09-29", "2026-09-30"], "2026-09-30").current,
    ).toBe(3);
    expect(streaks(["2026-09-28"], "2026-09-30").current).toBe(0);
  });
  it("counts longest streak, deduplicates days, crosses leap day", () => {
    expect(
      streaks(
        ["2024-02-28", "2024-02-29", "2024-02-29", "2024-03-01", "2024-03-04"],
        "2024-03-05",
      ),
    ).toEqual({ current: 1, longest: 3 });
  });
  it("uses nonzero distribution for adaptive intensity", () => {
    expect(getHeatmapIntensity(0, [1, 2, 3])).toBe(0);
    expect(getHeatmapIntensity(1, [0, 1, 2, 3, 100])).toBe(1);
    expect(getHeatmapIntensity(100, [1, 2, 3, 100])).toBe(5);
    expect(getHeatmapIntensity(5, [5])).toBe(2);
  });
  it("aggregates months and Monday-first weekdays", () => {
    expect(activityBreakdown(games).months[8]).toBe(3);
    expect(activityBreakdown(games).weekdays.slice(0, 2)).toEqual([2, 1]);
  });
});
describe("Ratings", () => {
  const games = [
    game({ id: "1", playerRating: 1000, endTime: 1 }),
    game({ id: "2", playerRating: 1010, endTime: 2 }),
    game({ id: "3", playerRating: 1020, endTime: 3 }),
    game({ id: "4", playerRating: 2000, timeClass: "blitz", endTime: 4 }),
    game({ id: "5", playerRating: 9000, rated: false, endTime: 5 }),
  ];
  it("keeps rating change in the rated standard pool", () => {
    expect(ratingSummary(games, "rapid")).toMatchObject({
      games: 3,
      current: 1020,
      start: 1000,
      change: 20,
      highest: 1020,
      lowest: 1000,
    });
    expect(ratingSummary(games, "blitz").change).toBeNull();
  });
  it("requires a complete rolling window", () =>
    expect(rollingAverage([10, 20, 30, 40], 3)).toEqual([null, null, 20, 30]));
  it("derives observed deltas only within pools", () => {
    const d = observedDeltas(games);
    expect(d.get("2")).toBe(10);
    expect(d.get("4")).toBeUndefined();
    expect(d.get("5")).toBeUndefined();
  });
});
describe("Openings and opponents", () => {
  const games = Array.from({ length: 10 }, (_, i) =>
    game({ id: String(i), result: i < 6 ? "win" : i < 8 ? "draw" : "loss" }),
  );
  it("aggregates openings separately by color", () => {
    expect(
      aggregateOpenings([...games, game({ playerColor: "black" })]),
    ).toHaveLength(2);
    expect(aggregateOpenings(games)[0]).toMatchObject({
      games: 10,
      wins: 6,
      draws: 2,
      losses: 2,
      winRate: 60,
    });
  });
  it("enforces ten-game best/worst opening sample", () => {
    expect(rankOpenings(games.slice(0, 9), "best")).toHaveLength(0);
    expect(rankOpenings(games, "worst")).toHaveLength(1);
  });
  it("aggregates opponent usernames case-insensitively", () => {
    expect(
      aggregateOpponents([...games, game({ opponentUsername: "BOB" })])[0],
    ).toMatchObject({ games: 11, averageRating: 1020, averageDifference: -20 });
  });
  it("enforces five-game head-to-head sample", () => {
    expect(opponentInsights(games.slice(0, 4)).best).toBeNull();
    expect(opponentInsights(games.slice(0, 5)).best?.name).toBe("bob");
  });
});
