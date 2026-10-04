import { describe, expect, it } from "vitest";
import type { NormalizedGame } from "../src/shared/types";
import type { EngineAnalysis, Mistake } from "../src/analysis/types";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  durationFingerprint,
  PLAY_TIME_PARSER_VERSION,
  type GameDurationRecord,
} from "../src/analysis/playTime";
import { MISTAKE_ANALYSIS_VERSION } from "../src/analysis/evaluation";
import {
  buildLifeEvidence,
  buildLifeMoments,
  generateLifeReviewInsights,
  lifeWilsonInterval,
  safeLifeGameUrl,
} from "../src/analytics/lifeReviewInsights";
import { lifeRating } from "../src/analytics/lifeReviewMetrics";
import { playTimeSummary } from "../src/analytics/playTime";

function game(id: string, patch: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    ...normalizeGame(
      {
        uuid: id,
        url: `https://www.chess.com/game/live/${id.replace(/\D/g, "") || "123"}`,
        end_time: 1767322800,
        time_class: "rapid",
        time_control: "600",
        rated: true,
        rules: "chess",
        white: { username: "alice", rating: 1200, result: "win" },
        black: { username: "bob", rating: 1300, result: "resigned" },
        pgn: '[ECO "C50"]\n[Opening "Italian Game"]',
      },
      "alice",
    )!,
    id,
    localDate: "2026-01-02",
    ...patch,
  };
}
const analysis = (
  g: NormalizedGame,
  patch: Partial<EngineAnalysis> = {},
): EngineAnalysis => ({
  id: g.id,
  username: g.username,
  analysisVersion: MISTAKE_ANALYSIS_VERSION,
  engineVersion: "saved local engine",
  nodes: 20000,
  analyzedAt: 1,
  source: "cached",
  ...patch,
});
const mistake = (
  g: NormalizedGame,
  index: number,
  severity: Mistake["severity"] = "blunder",
  patch: Partial<Mistake> = {},
): Mistake => ({
  id: `${g.id}:${index}:v1`,
  gameId: g.id,
  username: g.username,
  ply: index,
  moveNumber: index,
  playerColor: "white",
  fenBefore: "",
  playedMoveUci: "",
  playedMoveSan: "",
  bestMoveUci: "",
  bestMoveSan: "",
  evalBest: { type: "cp", value: 0 },
  evalPlayed: { type: "cp", value: -200 },
  centipawnLoss: 200,
  mateTransition: null,
  severity,
  phase: "middlegame",
  opening: null,
  createdAt: 1,
  bestLine: [],
  thinkSeconds: null,
  inPressure: null,
  ...patch,
});
function list(
  prefix: string,
  wins: number,
  losses: number,
  patch: Partial<NormalizedGame> = {},
) {
  return Array.from({ length: wins + losses }, (_, i) =>
    game(`${prefix}${i}`, { ...patch, result: i < wins ? "win" : "loss" }),
  );
}
const record = (
  g: NormalizedGame,
  seconds: number,
  patch: Partial<GameDurationRecord> = {},
): GameDurationRecord => ({
  id: g.id,
  username: g.username,
  parserVersion: PLAY_TIME_PARSER_VERSION,
  fingerprint: durationFingerprint(g),
  durationSeconds: seconds,
  startTimestamp: g.endTime * 1000 - seconds * 1000,
  endTimestamp: g.endTime * 1000,
  source: "pgn_start_end",
  confidence: "exact",
  ...patch,
});

describe("Life Review evidence", () => {
  it("counts saved zero-mistake analyses in the denominator and ignores duplicate, orphan and mismatched records", () => {
    const a = game("1"),
      b = game("2"),
      c = game("3");
    const m = mistake(a, 1);
    const evidence = buildLifeEvidence(
      [a, b, c],
      [],
      [
        analysis(a),
        analysis(a),
        analysis(b),
        analysis(c, { analysisVersion: 99 }),
      ],
      [
        m,
        m,
        mistake(a, 2, "mistake"),
        mistake(a, 3, "inaccuracy"),
        mistake(b, 1, "blunder", { username: "other" }),
        mistake(c, 1),
        mistake(a, 4, "blunder", { id: "old:v99" }),
      ],
    );
    expect(evidence.quality).toMatchObject({
      analyzed: 2,
      games: 3,
      blunders: 1,
      mistakes: 1,
      inaccuracies: 1,
      blundersPerGame: 0.5,
      coverage: 2 / 3,
    });
    expect(evidence.quality.trend).toEqual([
      {
        period: "2026-01",
        analyzed: 2,
        blunders: 1,
        mistakes: 1,
        inaccuracies: 1,
      },
    ]);
    expect(evidence.colors[0].analyzed).toBe(2);
  });
  it("keeps unavailable quality null rather than inventing zero mistakes or accuracy", () => {
    const evidence = buildLifeEvidence([game("1")], []);
    expect(evidence.quality.blundersPerGame).toBeNull();
    expect(evidence.quality.trend).toEqual([
      {
        period: "2026-01",
        analyzed: 0,
        blunders: 0,
        mistakes: 0,
        inaccuracies: 0,
      },
    ]);
    expect(generateLifeReviewInsights(evidence).notes.join(" ")).toContain(
      "Actual Game Review accuracy is not present",
    );
    expect(evidence).not.toHaveProperty("accuracy");
  });
  it("deduplicates IDs and excludes non-standard games from group denominators", () => {
    const a = game("1"),
      b = game("2", { rules: "chess960" });
    const evidence = buildLifeEvidence([a, a, b], []);
    expect(evidence.current.games).toBe(1);
    expect(evidence.colors.reduce((sum, row) => sum + row.games, 0)).toBe(1);
  });
  it("separates observed rated pools and never assigns rating contribution to colors or openings", () => {
    const games = [
      game("1", { playerRating: 1200, endTime: 1 }),
      game("2", { playerRating: 1210, endTime: 2 }),
      game("3", { playerRating: 4000, rated: false }),
      game("4", { playerRating: 1800, timeClass: "blitz" }),
    ];
    const evidence = buildLifeEvidence(games, []);
    expect(evidence.pools[0]).toMatchObject({
      observedStart: 1200,
      observedEnd: 1210,
      observedChange: 10,
    });
    expect(evidence.pools[1]).toMatchObject({
      observedStart: 1800,
      observedEnd: 1800,
      observedChange: null,
    });
    expect(evidence.colors[0]).not.toHaveProperty("observedChange");
    expect(evidence.openings[0]).not.toHaveProperty("observedChange");
  });
  it("bins opponent differences at exact +/-100 and +/-200 boundaries and labels score separately", () => {
    const opponents = [999, 1000, 1001, 1100, 1101, 1299, 1300, 1399, 1400];
    const games = opponents.map((rating, i) =>
      game(String(i), {
        opponentRating: rating,
        result: i === 5 ? "draw" : "win",
      }),
    );
    games.push(game("missing", { playerRating: null }));
    const evidence = buildLifeEvidence(games, []);
    expect(evidence.opponentBins.map((row) => row.games)).toEqual([
      2, 2, 2, 2, 1,
    ]);
    expect(evidence.opponentsWithRatings).toBe(9);
    expect(evidence.opponentBins[2]).toMatchObject({ winRate: 50, score: 75 });
  });
  it("keeps openings separate by color, limits frequent rankings to eight games and measures usage in pp", () => {
    const current = [
      ...list("w", 4, 4),
      ...list("b", 7, 0, { playerColor: "black" }),
      game("missing", { eco: null, openingName: null }),
    ];
    const previous = list("p", 8, 0);
    const evidence = buildLifeEvidence(current, previous);
    expect(evidence.openings).toHaveLength(2);
    expect(evidence.bestFrequent).toMatchObject({
      games: 8,
      color: "white",
      winRate: 50,
    });
    expect(evidence.worstFrequent?.key).toBe(evidence.bestFrequent?.key);
    expect(evidence.openings[0]).toMatchObject({
      previousGames: 8,
      previousWinRate: 100,
      usageChange: -50,
    });
  });
  it("uses compatible known duration metadata without substituting nominal clock time", () => {
    const a = game("a"),
      b = game("b");
    const evidence = buildLifeEvidence(
      [a, b],
      [],
      [],
      [],
      [record(a, 180), record(b, 120, { fingerprint: "stale" })],
    );
    expect(evidence.time).toMatchObject({
      withDuration: 1,
      totalRecordedSeconds: 180,
      eligibleRealtimeGames: 2,
    });
  });
  it("distinguishes same-family opening labels by ECO and keeps unanalyzed months as unavailable denominators", () => {
    const a = game("a", {
      openingName: "Pirc Defense",
      eco: "B07",
      playerColor: "black",
    });
    const b = game("b", {
      openingName: "Pirc Defense",
      eco: "B08",
      playerColor: "black",
      localDate: "2026-03-02",
    });
    const evidence = buildLifeEvidence([a, b], [], [analysis(a)], []);
    expect(new Set(evidence.openings.map((row) => row.label)).size).toBe(2);
    expect(evidence.openings.map((row) => row.label).sort()).toEqual([
      "B07 · Pirc Defense · black",
      "B08 · Pirc Defense · black",
    ]);
    expect(
      evidence.quality.trend.map((row) => [row.period, row.analyzed]),
    ).toEqual([
      ["2026-01", 1],
      ["2026-02", 0],
      ["2026-03", 0],
    ]);
    expect(
      evidence.quality.trend.map((row) =>
        row.analyzed ? row.blunders / row.analyzed : null,
      ),
    ).toEqual([0, null, null]);
  });
});

describe("deterministic evidence rules", () => {
  it("does not claim improvement for a tiny or noisy sample", () => {
    const tiny = buildLifeEvidence(
      list("n", 9, 0, { eco: null, openingName: null }),
      list("p", 0, 9, { eco: null, openingName: null }),
    );
    expect(generateLifeReviewInsights(tiny).improved).toEqual([]);
    const noisy = buildLifeEvidence(list("n", 12, 8), list("p", 10, 10));
    expect(generateLifeReviewInsights(noisy).improved).toEqual([]);
    expect(lifeWilsonInterval(0, 0)).toEqual([0, 1]);
  });
  it("supports strong improvements and regressions with exact pp and sample evidence", () => {
    const improved = generateLifeReviewInsights(
      buildLifeEvidence(list("n", 10, 0), list("p", 0, 10)),
    );
    expect(improved.improved[0]).toMatchObject({
      title: "Overall win rate increased",
    });
    expect(improved.improved[0].detail).toContain("+100.0 pp");
    expect(improved.headline).toEqual(improved.improved[0]);
    const regressed = generateLifeReviewInsights(
      buildLifeEvidence(list("n", 0, 10), list("p", 10, 0)),
    );
    expect(regressed.regressed[0].detail).toContain("-100.0 pp");
  });
  it("allows the opening threshold without lowering overall/color/pool thresholds", () => {
    const insights = generateLifeReviewInsights(
      buildLifeEvidence(list("n", 8, 0), list("p", 0, 8)),
    );
    expect(insights.improved).toHaveLength(1);
    expect(insights.improved[0].title).toContain("Italian Game");
  });
  it("compares engine rates per saved analyzed game with selection caveats, not raw mistake totals", () => {
    const current = list("n", 25, 25),
      previous = list("p", 25, 25);
    const analyses = [...current, ...previous].map((g) => analysis(g));
    const mistakes = [
      ...current.map((g) => mistake(g, 1)),
      ...previous.flatMap((g) => [1, 2, 3].map((i) => mistake(g, i))),
    ];
    const insights = generateLifeReviewInsights(
      buildLifeEvidence(current, previous, analyses, mistakes),
    );
    expect(insights.improved).toEqual([
      {
        title: "Blunder frequency decreased",
        detail: expect.stringContaining("3.00 → 1.00"),
      },
    ]);
    expect(insights.improved[0].detail).toContain("-67%");
    expect(insights.improved[0].detail).toContain("selection can affect");
  });
  it("does not assert an engine improvement from fewer than ten analyzed games per period", () => {
    const current = list("n", 5, 0),
      previous = list("p", 5, 0);
    const evidence = buildLifeEvidence(
      current,
      previous,
      [...current, ...previous].map((g) => analysis(g)),
      previous.flatMap((g) => [1, 2, 3, 4, 5].map((i) => mistake(g, i))),
    );
    expect(generateLifeReviewInsights(evidence).improved).toEqual([]);
  });
  it("has deterministic neutral empty output", () => {
    const a = generateLifeReviewInsights(buildLifeEvidence([], []));
    expect(a.headline.title).toBe("Nothing to review in this period");
    expect(a.improved).toEqual([]);
    expect(a.regressed).toEqual([]);
    expect(a).toEqual(generateLifeReviewInsights(buildLifeEvidence([], [])));
  });
});

describe("moments and safe game navigation", () => {
  it("highlights an actual rated opponent gap and valid durations, excluding stale fastest metadata", () => {
    const a = game("a", { opponentRating: 1350 }),
      b = game("b", { opponentRating: 1500 }),
      c = game("c", { result: "loss" });
    const games = [a, b, c],
      records = [
        record(a, 150),
        record(b, 600),
        record(c, 30),
        record(b, 1, { fingerprint: "stale" }),
      ];
    const moments = buildLifeMoments(
      games,
      playTimeSummary(
        games,
        records.filter((r) => r.fingerprint !== "stale"),
      ),
      lifeRating(games, "rapid"),
      {
        win: { games: [a, b], length: 2 },
        unbeaten: { games: [a, b], length: 2 },
        loss: { games: [c], length: 1 },
      },
      records,
    );
    expect(
      moments.best.find((m) => m.title === "Biggest rating upset")?.game?.id,
    ).toBe("b");
    expect(
      moments.best.find((m) => m.title === "Fastest recorded win")?.game?.id,
    ).toBe("a");
    expect(
      moments.best.find((m) => m.title === "Longest recorded game")?.game?.id,
    ).toBe("b");
    expect(moments.best.some((m) => /accuracy|comeback/i.test(m.title))).toBe(
      false,
    );
  });
  it("does not invent upset, accuracy or comeback moments without evidence", () => {
    const a = game("a", { playerRating: null, opponentRating: null });
    const empty = { games: [], length: 0 };
    const moments = buildLifeMoments(
      [a],
      playTimeSummary([a], []),
      lifeRating([a], "rapid"),
      { win: empty, unbeaten: empty, loss: empty },
    );
    expect(moments.best).toEqual([]);
    expect(moments.tough).toEqual([]);
    expect(moments.timeline).toEqual([]);
  });
  it("reports observed daily rating movement and a real loss streak in chronological bounded events", () => {
    const games = list("g", 0, 5).map((g, i) => ({
      ...g,
      endTime: g.endTime + i,
      playerRating: 1300 - i * 10,
    }));
    const empty = { games: [], length: 0 },
      streaks = { win: empty, unbeaten: empty, loss: { games, length: 5 } };
    const moments = buildLifeMoments(
      games,
      playTimeSummary(games, []),
      lifeRating(games, "rapid"),
      streaks,
    );
    expect(moments.tough.map((m) => m.title)).toEqual([
      "Day with the most losses",
      "Largest observed rating loss day",
      "Longest losing streak",
    ]);
    expect(moments.tough[1].detail).toContain("-40 points");
    expect(moments.tough[1].detail).toContain(
      "last game's post-game change is unavailable",
    );
    expect(moments.best.length).toBeLessThanOrEqual(6);
    expect(moments.tough.length).toBeLessThanOrEqual(6);
    expect(moments.timeline.length).toBeLessThanOrEqual(10);
    expect(moments.timeline.map((m) => m.date)).toEqual(
      [...moments.timeline.map((m) => m.date)].sort(),
    );
  });
  it.each([
    ["https://www.chess.com/game/live/123", true],
    ["https://chess.com/game/daily/42/", true],
    ["https://www.chess.com/analysis/game/live/123?tab=review", true],
    ["https://www.chess.com.evil.test/game/live/123", false],
    ["https://evil.test/game/live/123", false],
    ["http://www.chess.com/game/live/123", false],
    ["javascript:alert(1)", false],
    ["https://user:password@www.chess.com/game/live/123", false],
    ["https://www.chess.com:8443/game/live/123", false],
    ["https://www.chess.com/game/live/123/../../home", false],
    ["https://www.chess.com/game/live/abc", false],
  ])("validates game links %s", (url, allowed) => {
    expect(safeLifeGameUrl(url) !== null).toBe(allowed);
  });
});
