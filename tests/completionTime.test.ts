import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { validCompletionTime } from "../src/shared/dates";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const raw = {
  uuid: "future",
  end_time: 1893456000,
  rules: "chess",
  white: { username: "alice", result: "win" },
  black: { username: "bob", result: "resigned" },
};
it("rejects far-future completed games before they affect any statistics", () => {
  expect(normalizeGame(raw, "alice")).toBeNull();
  expect(validCompletionTime(Date.now() / 1000 + 60)).toBe(true);
  expect(validCompletionTime(Date.now() / 1000 + 61)).toBe(false);
  for (const invalid of [0, -1, NaN, Infinity, "123", null, undefined])
    expect(validCompletionTime(invalid)).toBe(false);
});
it("excludes legacy corrupt cache rows without deleting saved game analyses", async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { database, transactionDone } =
    await import("../src/data/storage/database");
  const { getGames } = await import("../src/data/storage/gameRepository");
  const valid = normalizeGame(
    { ...raw, uuid: "valid", end_time: Date.now() / 1000 - 100 },
    "alice",
  )!;
  const db = await database(),
    tx = db.transaction(["games", "engineAnalysis"], "readwrite"),
    done = transactionDone(tx);
  tx.objectStore("games").put(valid);
  tx.objectStore("games").put({
    ...valid,
    id: "alice:legacy-corrupt",
    endTime: raw.end_time,
  });
  tx.objectStore("engineAnalysis").put({
    id: valid.id,
    username: "alice",
    analysisVersion: 1,
  });
  await done;
  expect((await getGames("alice")).map((g) => g.id)).toEqual([valid.id]);
  const { idbResult } = await import("../src/data/storage/database");
  expect(
    await idbResult(
      db.transaction("engineAnalysis").objectStore("engineAnalysis").count(),
    ),
  ).toBe(1);
  db.close();
});
