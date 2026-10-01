import { it, expect, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
it("replays user FENs, classifies, commits a game and findings, requeries counts, skips a malformed neighbor and retains compatible results", async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { put, analysisRequest, analysisState, saveEngineGame } =
    await import("../src/data/storage/analysisRepository");
  const { analyzeGame, storedGameReplay } =
    await import("../src/analysis/engine");
  const { ENGINE_VERSION, ENGINE_NODES } =
    await import("../src/analysis/evaluation");
  const { pgnFingerprint } = await import("../src/analysis/fingerprint");
  const game = normalizeGame(
    {
      uuid: "controlled",
      url: "https://www.chess.com/game/live/123",
      end_time: 1790000000,
      time_class: "rapid",
      time_control: "600",
      rules: "chess",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
    },
    "alice",
  )!;
  await put("games", game);
  await put("games", {
    ...game,
    id: "malformed",
    pgn: '[White "alice"]\n[Result "1-0"]\n\n1. invalid 1-0',
  });
  const queued = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    ids: [game.id, "malformed"],
  });
  expect(queued.queue).toMatchObject({
    selected: 2,
    withPgn: 2,
    parseable: 1,
    skipped: 1,
    ids: [game.id],
  });
  expect(storedGameReplay(game)).toMatchObject({
    success: true,
    moveCount: 4,
    fenCount: 2,
    userColor: "white",
  });
  const positions: string[] = [];
  const engine = {
    newGame: vi.fn(),
    evaluate: async (fen: string) => {
      positions.push(fen);
      return positions.length === 1
        ? { score: { type: "cp", value: 500 }, best: "d2d4", pv: ["d2d4"] }
        : positions.length === 2
          ? { score: { type: "cp", value: 0 }, best: "e7e5", pv: [] }
          : { score: { type: "cp", value: 0 }, best: "g1f3", pv: ["g1f3"] };
    },
  } as unknown as import("../src/analysis/engine").LocalEngine;
  const findings = await analyzeGame(game, engine, async () => undefined);
  expect(positions).toHaveLength(3);
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({
    severity: "blunder",
    centipawnLoss: 500,
    playedMoveSan: "e4",
    bestMoveSan: "d4",
  });
  await saveEngineGame(
    {
      id: game.id,
      username: "alice",
      analysisVersion: 1,
      engineVersion: ENGINE_VERSION,
      nodes: ENGINE_NODES,
      analyzedAt: Date.now(),
      source: pgnFingerprint(game.pgn!),
    },
    findings,
  );
  const refreshed = await analysisState("alice");
  expect(refreshed.analyses).toHaveLength(1);
  expect(
    refreshed.mistakes.filter((m) => m.severity === "blunder"),
  ).toHaveLength(1);
  expect((await analysisState("alice")).analyses).toHaveLength(1);
  expect(
    (
      await analysisRequest({
        type: "ci:analysis",
        username: "alice",
        action: "enqueue",
        ids: [game.id],
      })
    ).queue?.ids,
  ).toEqual([]);
  // A browser restart clears session leases but retains the durable running
  // queue. Pausing that orphan must release Resume without losing findings.
  await put("analysisQueue", {
    id: "alice",
    username: "alice",
    ids: [game.id],
    total: 1,
    completed: 0,
    status: "running",
    engine: {
      workerCreated: true,
      wasmLoaded: true,
      uciOk: true,
      readyOk: true,
      running: true,
      error: null,
    },
  });
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn() },
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    storage: { session: { get: async () => ({}) } },
  });
  const { handleMessage } = await import("../src/background/serviceWorker");
  expect(
    (
      await handleMessage({
        type: "ci:analysis",
        username: "alice",
        action: "pause",
      })
    ).ok,
  ).toBe(true);
  const recovered = await analysisState("alice");
  expect(recovered.queue).toMatchObject({
    status: "paused",
    engine: { running: false },
  });
  expect(recovered.analyses).toHaveLength(1);
  expect(recovered.mistakes).toHaveLength(1);
  vi.unstubAllGlobals();
});
