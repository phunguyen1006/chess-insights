import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  ENGINE_NODES,
  ENGINE_VERSION,
  MISTAKE_ANALYSIS_VERSION,
} from "../src/analysis/evaluation";
import { pgnFingerprint } from "../src/analysis/fingerprint";
import type { NormalizedGame } from "../src/shared/types";
const game = (id: string, time = 1): NormalizedGame =>
  normalizeGame(
    {
      uuid: id,
      url: `https://www.chess.com/game/live/${id}`,
      end_time: time,
      rules: "chess",
      time_class: "rapid",
      time_control: "600",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
    },
    "alice",
  )!;
const analysis = (g: NormalizedGame) => ({
  id: g.id,
  username: g.username,
  analysisVersion: MISTAKE_ANALYSIS_VERSION,
  engineVersion: ENGINE_VERSION,
  nodes: ENGINE_NODES,
  analyzedAt: 1,
  source: pgnFingerprint(g.pgn!),
});
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => vi.unstubAllGlobals());
it("previews and queues every eligible uncached game across years, regardless of supplied filter IDs", async () => {
  const { put, analysisRequest, saveEngineGame } =
    await import("../src/data/storage/analysisRepository");
  const games = Array.from({ length: 125 }, (_, i) => game(`g-${i}`, i + 1));
  for (const g of games) await put("games", g);
  await saveEngineGame(analysis(games[0]), []);
  await put("games", { ...game("invalid"), pgn: "bad PGN" });
  await put("games", { ...game("variant"), rules: "chess960" });
  await put("games", { ...game("missing"), pgn: undefined });
  await put("games", {
    ...game("not-player"),
    pgn: game("x").pgn!.replace('White "alice"', 'White "mallory"'),
  });
  await put("games", { ...game("other-account"), username: "bob" });
  const preview = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "state",
    includeSelection: true,
  });
  expect(preview.selection).toEqual({
    total: 129,
    analyzed: 1,
    pending: 124,
    skipped: 4,
  });
  const queued = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    scope: "unanalyzed",
    ids: [games[0].id],
    force: true,
    includeSelection: true,
  });
  expect(queued.queue).toMatchObject({
    total: 124,
    selected: 129,
    parseable: 125,
    skipped: 4,
    status: "paused",
    reanalyze: false,
  });
  expect(queued.queue?.ids).toEqual(
    games
      .slice(1)
      .reverse()
      .map((g) => g.id),
  );
  await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "cancel",
  });
  for (const g of games.slice(1)) await saveEngineGame(analysis(g), []);
  const finished = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    scope: "unanalyzed",
    includeSelection: true,
  });
  expect(finished.queue).toMatchObject({ total: 0, ids: [], status: "idle" });
  expect(finished.selection).toMatchObject({
    analyzed: 125,
    pending: 0,
    skipped: 4,
  });
});
it("invalidates outdated engine, settings and PGN results, and refreshes preview when archives change", async () => {
  const { put, saveEngineGame, analysisRequest } =
    await import("../src/data/storage/analysisRepository");
  const games = [
    game("fresh"),
    game("old-engine"),
    game("old-nodes"),
    game("old-version"),
    game("changed-source"),
  ];
  for (const g of games) {
    await put("games", g);
    await saveEngineGame(analysis(g), []);
  }
  await put("engineAnalysis", { ...analysis(games[1]), engineVersion: "old" });
  await put("engineAnalysis", { ...analysis(games[2]), nodes: 1 });
  await put("engineAnalysis", { ...analysis(games[3]), analysisVersion: 0 });
  await put("engineAnalysis", { ...analysis(games[4]), source: "old" });
  await put("users", { username: "alice", version: 1 });
  const request = () =>
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "state",
      includeSelection: true,
    });
  expect((await request()).selection).toMatchObject({
    pending: 4,
    analyzed: 1,
  });
  await put("games", game("new-game", 20));
  await put("users", { username: "alice", version: 2 });
  expect((await request()).selection).toMatchObject({
    total: 6,
    pending: 5,
    analyzed: 1,
  });
  await put("games", { ...games[0], pgn: "broken" });
  await put("users", { username: "alice", version: 3 });
  expect((await request()).selection).toMatchObject({
    total: 6,
    pending: 5,
    analyzed: 0,
    skipped: 1,
  });
});
it("reports empty and unsupported histories without starting a worker", async () => {
  const { put, analysisRequest } =
    await import("../src/data/storage/analysisRepository");
  const request = () =>
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "enqueue",
      scope: "unanalyzed",
      includeSelection: true,
    });
  expect((await request()).queue).toMatchObject({
    ids: [],
    total: 0,
    status: "idle",
  });
  await put("games", { ...game("unsupported"), rules: "chess960" });
  const result = await request();
  expect(result.queue).toMatchObject({ ids: [], status: "error", skipped: 1 });
  expect(result.selection).toEqual({
    total: 1,
    pending: 0,
    skipped: 1,
    analyzed: 0,
  });
});
