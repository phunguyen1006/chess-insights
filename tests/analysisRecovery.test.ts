import { IDBFactory } from "fake-indexeddb";
import { afterEach, expect, it, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  ENGINE_NODES,
  ENGINE_VERSION,
  MISTAKE_ANALYSIS_VERSION,
} from "../src/analysis/evaluation";
import { pgnFingerprint } from "../src/analysis/fingerprint";
import type { Mistake, Review } from "../src/analysis/types";
const gate = vi.hoisted(() => ({
  wait: null as Promise<void> | null,
  calls: 0,
}));
vi.mock("../src/analysis/selection", async (original) => {
  const real = await original<typeof import("../src/analysis/selection")>();
  return {
    selectAnalysisGames: async (
      ...args: Parameters<typeof real.selectAnalysisGames>
    ) => {
      gate.calls++;
      if (gate.wait) await gate.wait;
      return real.selectAnalysisGames(...args);
    },
  };
});
afterEach(() => {
  gate.wait = null;
  vi.unstubAllGlobals();
});
it("preserves 108 older-release results, findings, reviews and queue; reads them while preview is blocked", async () => {
  vi.resetModules();
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      for (const name of [
        "games",
        "archives",
        "puzzleAttempts",
        "moveTimeAnalysis",
        "engineAnalysis",
        "mistakes",
        "mistakeReviews",
        "analysisQueue",
      ]) {
        const s = req.result.createObjectStore(name, { keyPath: "id" });
        s.createIndex("username", "username");
      }
      req.result.createObjectStore("users", { keyPath: "username" });
      req.result.createObjectStore("analyticsCache", { keyPath: "id" });
      req.result.createObjectStore("puzzleTrackingState", {
        keyPath: "username",
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const games = Array.from({ length: 125 }, (_, i) =>
    normalizeGame(
      {
        uuid: `old-${i}`,
        url: `https://www.chess.com/game/live/${i}`,
        end_time: 1700000000 + i,
        rules: "chess",
        time_class: "rapid",
        time_control: "600",
        white: { username: "alice", result: "win" },
        black: { username: "bob", result: "resigned" },
        pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
      },
      "alice",
    )!,
  );
  const tx = old.transaction(
    [
      "games",
      "users",
      "engineAnalysis",
      "mistakes",
      "mistakeReviews",
      "analysisQueue",
    ],
    "readwrite",
  );
  games.forEach((g) => tx.objectStore("games").put(g));
  tx.objectStore("users").put({ username: "alice", version: 1 });
  for (const g of games.slice(0, 108)) {
    tx.objectStore("engineAnalysis").put({
      id: g.id,
      username: "alice",
      analysisVersion: MISTAKE_ANALYSIS_VERSION,
      engineVersion: ENGINE_VERSION,
      nodes: ENGINE_NODES,
      analyzedAt: 1,
      source: pgnFingerprint(g.pgn!),
    });
    tx.objectStore("mistakes").put({
      id: `${g.id}:1:v1`,
      username: "alice",
      gameId: g.id,
      severity: "blunder",
    } as Mistake);
  }
  const review = {
    id: `${games[0].id}:1:v1`,
    username: "alice",
    history: [{ at: 1, grade: "Good", correct: true }],
    reviewCount: 1,
  } as Review;
  tx.objectStore("mistakeReviews").put(review);
  const ids = games.slice(108).map((g) => g.id);
  tx.objectStore("analysisQueue").put({
    id: "alice",
    username: "alice",
    ids,
    completed: 108,
    total: 125,
    status: "paused",
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  const repo = await import("../src/data/storage/analysisRepository");
  let release!: () => void;
  gate.wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  gate.calls = 0;
  const preview = repo.analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "selection",
  });
  const saved = await repo.analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "state",
  });
  expect(saved.analyses).toHaveLength(108);
  expect(saved.mistakes).toHaveLength(108);
  expect(saved.reviews).toEqual([review]);
  expect(saved.queue).toMatchObject({
    ids,
    completed: 108,
    total: 125,
    status: "paused",
  });
  release();
  expect((await preview).selection).toEqual({
    total: 125,
    analyzed: 108,
    pending: 17,
    skipped: 0,
  });
  await Promise.all(
    Array.from({ length: 5 }, () =>
      repo.analysisRequest({
        type: "ci:analysis",
        username: "alice",
        action: "selection",
      }),
    ),
  );
  expect(gate.calls).toBe(1);
  const queued = await repo.analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    scope: "unanalyzed",
  });
  expect(queued.queue?.ids).toEqual([...ids].reverse());
  expect(queued.analyses).toHaveLength(108);
  expect(queued.reviews).toEqual([review]);
  (await (await import("../src/data/storage/database")).database()).close();
});
