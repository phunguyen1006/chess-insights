import { IDBFactory } from "fake-indexeddb";
import { it, expect, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { ENGINE_VERSION, ENGINE_NODES } from "../src/analysis/evaluation";
it("upgrades populated v1 history additively and caches/version-checks derived data", async () => {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  const game = normalizeGame(
    {
      uuid: "preserved",
      url: "https://www.chess.com/game/live/123",
      end_time: 1790000000,
      time_class: "rapid",
      time_control: "600",
      rules: "chess",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:09:58]} e5 {[%clk 0:09:57]} 1-0',
    },
    "alice",
  )!;
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = factory.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      for (const name of ["games", "archives"]) {
        const s = r.result.createObjectStore(name, { keyPath: "id" });
        s.createIndex("username", "username");
      }
      r.result.createObjectStore("users", { keyPath: "username" });
      r.result.createObjectStore("analyticsCache", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = old.transaction(
    ["games", "archives", "users", "analyticsCache"],
    "readwrite",
  );
  tx.objectStore("games").put(game);
  tx.objectStore("archives").put({
    id: "a",
    username: "alice",
    fingerprint: "archive-preserved",
  });
  tx.objectStore("users").put({ username: "alice", version: 7 });
  tx.objectStore("analyticsCache").put({ id: "cache", value: 42 });
  await new Promise<void>((r) => {
    tx.oncomplete = () => r();
  });
  old.close();
  const { database, idbResult } = await import("../src/data/storage/database");
  const db = await database();
  expect(db.version).toBe(4);
  expect(
    await idbResult(db.transaction("games").objectStore("games").get(game.id)),
  ).toEqual(game);
  expect(
    await idbResult(
      db.transaction("archives").objectStore("archives").get("a"),
    ),
  ).toMatchObject({ fingerprint: "archive-preserved" });
  expect(
    await idbResult(db.transaction("users").objectStore("users").get("alice")),
  ).toMatchObject({ version: 7 });
  expect(
    await idbResult(
      db
        .transaction("analyticsCache")
        .objectStore("analyticsCache")
        .get("cache"),
    ),
  ).toMatchObject({ value: 42 });
  const { analyzeClocks, analysisRequest, saveEngineGame } =
    await import("../src/data/storage/analysisRepository");
  let state = await analyzeClocks("alice", [game.id]);
  expect(state.clocks).toHaveLength(1);
  expect(state.clocks[0].moves[0].thinkSeconds).toBe(2);
  expect(state.clocks[0].source).not.toContain("Result");
  const clockSource = state.clocks[0].source;
  state = await analyzeClocks("alice", [game.id]);
  expect(state.clocks).toHaveLength(1);
  state = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    ids: [game.id, game.id],
  });
  expect(state.queue?.ids).toEqual([game.id]);
  await saveEngineGame(
    {
      id: game.id,
      username: "alice",
      analysisVersion: 1,
      engineVersion: ENGINE_VERSION,
      nodes: ENGINE_NODES,
      analyzedAt: 1,
      source: clockSource,
    },
    [],
  );
  state = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    ids: [game.id],
  });
  expect(state.queue?.ids).toEqual([]);
  state = await analysisRequest({
    type: "ci:analysis",
    username: "alice",
    action: "enqueue",
    ids: [game.id],
    force: true,
  });
  expect(state.queue?.ids).toEqual([game.id]);
  expect(state.queue?.reanalyze).toBe(true);
  expect((await analyzeClocks("bob", [game.id])).clocks).toHaveLength(0);
  db.close();
  vi.unstubAllGlobals();
});
