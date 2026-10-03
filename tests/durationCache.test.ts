import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { DB_NAME, DB_VERSION } from "../src/shared/constants";

let db: IDBDatabase | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  db?.close();
  db = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const game = (id: string, username = "alice") =>
  normalizeGame(
    {
      uuid: id,
      end_time: Date.parse("2026-10-02T12:10:00Z") / 1000,
      time_class: "rapid",
      time_control: "600",
      rules: "chess",
      white: { username, result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: '[UTCDate "2026.10.02"]\n[UTCTime "12:00:00"]\n[EndDate "2026.10.02"]\n[EndTime "12:10:00"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    },
    username,
  )!;
async function storeGames(list: ReturnType<typeof game>[]) {
  const storage = await import("../src/data/storage/database");
  db = await storage.database();
  const tx = db.transaction("games", "readwrite"),
    done = storage.transactionDone(tx);
  for (const row of list) tx.objectStore("games").put(row);
  await done;
}
it("incrementally caches durations, reparses changed PGNs and versions, and isolates accounts", async () => {
  const a = game("a"),
    b = game("b", "carol");
  await storeGames([a, b]);
  const parser = await import("../src/analysis/playTime"),
    parse = vi.spyOn(parser, "parseGameDuration");
  const { ensureGameDurations, durationSnapshot } =
    await import("../src/data/storage/durationRepository");
  expect(await durationSnapshot("alice")).toEqual([]);
  expect((await ensureGameDurations("alice"))[0].durationSeconds).toBe(600);
  expect(parse).toHaveBeenCalledTimes(1);
  await ensureGameDurations("alice");
  expect(parse).toHaveBeenCalledTimes(1);
  expect(await durationSnapshot("carol")).toEqual([]);
  a.pgn = a.pgn!.replace("12:10:00", "12:12:00");
  await storeGames([a]);
  expect((await ensureGameDurations("alice"))[0].durationSeconds).toBe(720);
  expect(parse).toHaveBeenCalledTimes(2);
  const { transactionDone } = await import("../src/data/storage/database");
  const previous = (await durationSnapshot("alice"))[0];
  const tx = db!.transaction("gameDurationAnalysis", "readwrite"),
    done = transactionDone(tx);
  tx.objectStore("gameDurationAnalysis").put({ ...previous, parserVersion: 0 });
  await done;
  await ensureGameDurations("alice");
  expect(parse).toHaveBeenCalledTimes(3);
  expect(await ensureGameDurations("carol")).toHaveLength(1);
  expect((await durationSnapshot("alice"))[0].username).toBe("alice");
});
it("yields startup, exposes bounded progress and shares a running account job", async () => {
  await storeGames(Array.from({ length: 25 }, (_, i) => game(String(i))));
  const { ensureGameDurations, durationSnapshot } =
    await import("../src/data/storage/durationRepository");
  const firstProgress: number[] = [],
    secondProgress: number[] = [];
  const first = ensureGameDurations("alice", (p) =>
    firstProgress.push(p.processed),
  );
  const second = ensureGameDurations("alice", (p) =>
    secondProgress.push(p.processed),
  );
  expect(first).toBe(second);
  expect(await durationSnapshot("alice")).toHaveLength(0);
  expect(await first).toHaveLength(25);
  expect(firstProgress[0]).toBe(0);
  expect(firstProgress.at(-1)).toBe(25);
  expect(
    firstProgress.some((processed) => processed > 0 && processed < 25),
  ).toBe(true);
  expect(
    firstProgress.every(
      (processed, index) =>
        !index || processed - firstProgress[index - 1] <= 12,
    ),
  ).toBe(true);
  expect(secondProgress).toEqual(firstProgress);
});
it("includes newly synced PGNs when a late analyze request joins the current job", async () => {
  await storeGames(Array.from({ length: 20 }, (_, i) => game(String(i))));
  const { ensureGameDurations } =
    await import("../src/data/storage/durationRepository");
  let reached!: () => void;
  const firstBatch = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const first = ensureGameDurations("alice", (p) => {
    if (p.processed > 0 && p.processed < p.total) reached();
  });
  await firstBatch;
  await storeGames([game("late")]);
  const joined = ensureGameDurations("alice");
  expect(joined).toBe(first);
  const result = await first;
  expect(result).toHaveLength(21);
  expect(result.some((r) => r.id.endsWith(":late"))).toBe(true);
});
it("adds the duration store to populated v3 without rewriting any existing data", async () => {
  const factory = indexedDB;
  const names = [
    "games",
    "archives",
    "users",
    "analyticsCache",
    "moveTimeAnalysis",
    "engineAnalysis",
    "mistakes",
    "mistakeReviews",
    "analysisQueue",
    "puzzleAttempts",
    "puzzleTrackingState",
  ];
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      for (const name of names) {
        const store = req.result.createObjectStore(name, {
          keyPath: ["users", "puzzleTrackingState"].includes(name)
            ? "username"
            : "id",
        });
        if (!["users", "puzzleTrackingState", "analyticsCache"].includes(name))
          store.createIndex("username", "username");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = old.transaction(names, "readwrite");
  for (const name of names)
    tx.objectStore(name).put({
      id: `${name}:original`,
      username: "alice",
      value: `original-${name}`,
    });
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
  old.close();
  const { database, idbResult } = await import("../src/data/storage/database");
  db = await database();
  expect(db.version).toBe(DB_VERSION);
  expect(db.objectStoreNames.contains("gameDurationAnalysis")).toBe(true);
  for (const name of names)
    expect(
      await idbResult(
        db
          .transaction(name)
          .objectStore(name)
          .get(
            ["users", "puzzleTrackingState"].includes(name)
              ? "alice"
              : `${name}:original`,
          ),
      ),
    ).toMatchObject({ value: `original-${name}` });
});
