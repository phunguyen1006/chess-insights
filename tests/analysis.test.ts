import { expect, it } from "vitest";
import {
  parsePgnClockData,
  clockSeconds,
  phaseFor,
  timePressureThreshold,
  completedPgn,
} from "../src/analysis/clocks";
import {
  compareEvaluations,
  userEvaluation,
  scheduleReview,
} from "../src/analysis/evaluation";
import { historicalInsightsUrl } from "../src/analysis/safety";
import { analyzeGame, type LocalEngine } from "../src/analysis/engine";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import source from "../src/dev/data/public-games.json";
import type { RawGame } from "../src/shared/types";
const pgn = (body: string, result = "1-0") =>
  `[Result "${result}"]\n\n${body} ${result}`;
it("parses the actual public archive fixture without invented timings", () => {
  const games = (source.games as RawGame[])
    .map((g) => normalizeGame(g, source.username))
    .filter((g) => g && ["rapid", "blitz", "bullet"].includes(g.timeClass));
  expect(games).toHaveLength(72);
  for (const game of games) {
    const c = parsePgnClockData(game!.pgn!, game!.timeControl);
    expect(c.supported).toBe(true);
    expect(
      c.moves.filter(
        (m) => m.color === game!.playerColor && m.thinkSeconds !== null,
      ).length,
    ).toBeGreaterThan(0);
  }
  expect(
    parsePgnClockData(pgn("1. e4 {[%timestamp 123]} e5"), "600").supported,
  ).toBe(false);
});
it("parses hours and fractional seconds; rejects malformed values", () => {
  expect(clockSeconds("{[%clk 1:02:03.25]}")).toBe(3723.25);
  expect(clockSeconds("[%clk 0:59:59]")).toBe(3599);
  expect(clockSeconds("[%clk 0:60:00]")).toBeNull();
  expect(clockSeconds("[%clk 0:00:60]")).toBeNull();
  expect(clockSeconds("[%clk -1:00:00]")).toBeNull();
  expect(clockSeconds("")).toBeNull();
});
it("includes increment on first white and first black move", () => {
  const c = parsePgnClockData(
    pgn("1. e4 {[%clk 0:09:56]} e5 {[%clk 0:09:58]}"),
    "600+5",
  );
  expect(c.supported).toBe(true);
  expect(c.moves.map((m) => m.thinkSeconds)).toEqual([9, 7]);
  expect(c.moves[1].color).toBe("black");
});
it("keeps missing clock intervals null and never attributes multi-move gaps to one move", () => {
  const c = parsePgnClockData(
    pgn(
      "1. e4 {[%clk 0:09:59]} e5 {[%clk 0:09:58]} 2. Nf3 Nc6 3. Bb5 {[%clk 0:09:40]} a6 {[%clk 0:09:42]} 4. Ba4 {[%clk 0:09:38]} Nf6 {[%clk 0:09:40]}",
    ),
    "600",
  );
  expect(c.moves.map((m) => m.thinkSeconds)).toEqual([
    1,
    2,
    null,
    null,
    null,
    null,
    2,
    2,
  ]);
});
it("retains instant moves and clamps tiny rounding errors", () => {
  expect(
    parsePgnClockData(
      pgn("1. e4 {[%clk 0:10:00.2]} e5 {[%clk 0:09:59.7]}"),
      "600",
    ).moves.map((m) => m.thinkSeconds),
  ).toEqual([0, expect.closeTo(0.3, 4)]);
});
it("rejects impossible intervals and excludes Daily and unfinished games", () => {
  expect(
    parsePgnClockData(pgn("1. e4 {[%clk 0:12:00]} e5"), "600").supported,
  ).toBe(false);
  expect(parsePgnClockData(pgn("1. e4 e5"), "1/86400").moves).toHaveLength(0);
  expect(parsePgnClockData(pgn("1. e4 e5", "*"), "600").moves).toHaveLength(0);
  expect(completedPgn('[Result "1-0"]\n1. e4 *')).toBe(false);
});
it("classifies phases deterministically from board material", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(phaseFor(start, 10)).toBe("opening");
  expect(phaseFor(start, 11)).toBe("middlegame");
  expect(phaseFor("4k3/8/8/8/8/8/8/4K3 w - - 0 30", 30)).toBe("endgame");
  expect(timePressureThreshold(60)).toBe(6);
  expect(timePressureThreshold(600)).toBe(30);
});
it("normalizes engine scores to both player perspectives", () => {
  expect(userEvaluation({ type: "cp", value: 200 }, "w", "white").value).toBe(
    200,
  );
  expect(userEvaluation({ type: "cp", value: 200 }, "b", "white").value).toBe(
    -200,
  );
  expect(userEvaluation({ type: "cp", value: 200 }, "b", "black").value).toBe(
    200,
  );
  expect(userEvaluation({ type: "cp", value: 200 }, "w", "black").value).toBe(
    -200,
  );
});
it("classifies CP loss, clamps noise and suppresses swings in already lost positions", () => {
  expect(
    compareEvaluations({ type: "cp", value: 40 }, { type: "cp", value: -230 }),
  ).toMatchObject({ centipawnLoss: 270, severity: "blunder" });
  expect(
    compareEvaluations({ type: "cp", value: 10 }, { type: "cp", value: 40 })
      .centipawnLoss,
  ).toBe(0);
  expect(
    compareEvaluations({ type: "cp", value: 0 }, { type: "cp", value: -50 })
      .severity,
  ).toBe("inaccuracy");
  expect(
    compareEvaluations({ type: "cp", value: 0 }, { type: "cp", value: -100 })
      .severity,
  ).toBe("mistake");
  expect(
    compareEvaluations(
      { type: "cp", value: 0 },
      { type: "cp", value: -900 },
      true,
    ).severity,
  ).toBeNull();
  expect(
    compareEvaluations(
      { type: "cp", value: -900 },
      { type: "cp", value: -1100 },
    ).severity,
  ).toBeNull();
});
it("keeps mate transitions separate from centipawns", () => {
  const delivered = userEvaluation({ type: "mate", value: 0 }, "b", "white");
  expect(delivered).toMatchObject({ value: 1, terminal: true });
  expect(
    compareEvaluations({ type: "mate", value: 3 }, delivered).severity,
  ).toBeNull();
  expect(userEvaluation({ type: "mate", value: 0 }, "w", "white").value).toBe(
    -1,
  );
  expect(userEvaluation({ type: "mate", value: 0 }, "w", "black").value).toBe(
    1,
  );
  expect(
    compareEvaluations({ type: "mate", value: 3 }, { type: "cp", value: 500 }),
  ).toMatchObject({ severity: "blunder", centipawnLoss: null });
  expect(
    compareEvaluations({ type: "cp", value: 30 }, { type: "mate", value: -2 })
      .severity,
  ).toBe("blunder");
  expect(
    compareEvaluations({ type: "mate", value: 3 }, { type: "mate", value: 8 })
      .severity,
  ).toBeNull();
  expect(
    compareEvaluations({ type: "mate", value: -3 }, { type: "mate", value: -1 })
      .severity,
  ).toBeNull();
});
it.each([
  ["Again", 1],
  ["Hard", 3],
  ["Good", 7],
  ["Easy", 21],
] as const)("schedules %s with injected dates", (grade, days) => {
  expect(
    scheduleReview("m", "alice", grade, true, undefined, 1000).nextReviewAt,
  ).toBe(1000 + days * 86400000);
});
it("requires repeated success plus long interval for mastery, and retains history", () => {
  let r = scheduleReview("m", "alice", "Easy", true, undefined, 1000);
  r = scheduleReview("m", "alice", "Good", true, r, 2000);
  expect(r.mastered).toBe(false);
  r = scheduleReview("m", "alice", "Easy", true, r, 3000);
  expect(r.mastered).toBe(true);
  r = scheduleReview("m", "alice", "Again", false, r, 4000);
  expect(r.mastered).toBe(false);
  expect(r.history).toHaveLength(4);
});
it("authorizes only Chess.com historical Mistakes URLs", () => {
  expect(
    historicalInsightsUrl("https://www.chess.com/home#chess-insights/mistakes"),
  ).toBe(true);
  for (const u of [
    "https://www.chess.com/game/live/1#chess-insights/mistakes",
    "https://www.chess.com/play/online#chess-insights/mistakes",
    "https://www.chess.com/home#chess-insights/time",
    "https://evil.example/home#chess-insights/mistakes",
  ])
    expect(historicalInsightsUrl(u)).toBe(false);
});
it("replays only player moves and records normalized black-side losses", async () => {
  const game = normalizeGame(
    {
      url: "https://www.chess.com/game/live/123",
      uuid: "g",
      end_time: 1760000000,
      time_class: "rapid",
      time_control: "600",
      rules: "chess",
      white: { username: "bob", result: "win" },
      black: { username: "alice", result: "resigned" },
      pgn: pgn("1. e4 e5"),
    },
    "alice",
  )!;
  let evaluated = 0;
  const engine = {
    newGame: () => undefined,
    evaluate: async () =>
      ++evaluated === 1
        ? { score: { type: "cp", value: 50 }, best: "c7c5", pv: ["c7c5"] }
        : { score: { type: "cp", value: 250 }, best: "g1f3", pv: [] },
  } as unknown as LocalEngine;
  const ms = await analyzeGame(game, engine, async () => undefined);
  expect(evaluated).toBe(2);
  expect(ms).toHaveLength(1);
  expect(ms[0]).toMatchObject({
    ply: 2,
    playerColor: "black",
    centipawnLoss: 300,
    severity: "blunder",
    bestMoveSan: "c5",
  });
});
it("checks pause authorization again before evaluating the played response", async () => {
  const game = normalizeGame(
    {
      uuid: "guarded",
      end_time: 1760000000,
      rules: "chess",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: pgn("1. e4 e5"),
    },
    "alice",
  )!;
  let calls = 0;
  const engine = {
    newGame: () => undefined,
    evaluate: async () => {
      calls++;
      return { score: { type: "cp", value: 0 }, best: "d2d4", pv: [] };
    },
  } as unknown as LocalEngine;
  let guards = 0;
  await expect(
    analyzeGame(game, engine, async () => {
      if (++guards === 2) throw new Error("paused");
    }),
  ).rejects.toThrow("paused");
  expect(calls).toBe(1);
});
