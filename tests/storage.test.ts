import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { getGames, upsertArchive } from "../src/data/storage/gameRepository";
import { shouldRefreshArchive } from "../src/data/sync/syncManager";
import { database } from "../src/data/storage/database";
import type { Archive, UserRecord } from "../src/shared/types";
const raw = {
  uuid: "duplicate",
  end_time: 1767322800,
  time_class: "rapid",
  white: { username: "alice", result: "win" },
  black: { username: "bob", result: "resigned" },
};
it("upserts duplicate games atomically and keeps account caches apart", async () => {
  const alice = normalizeGame(raw, "alice")!,
    bob = normalizeGame(raw, "bob")!;
  const archive: Archive = {
    id: "alice:2026:1",
    username: "alice",
    year: 2026,
    month: 1,
    lastFetchedAt: Date.now(),
    gameCount: 1,
    syncStatus: "synced",
    timezone: "UTC",
    fingerprint: "test",
  };
  const user: UserRecord = {
    username: "alice",
    archives: [],
    indexFetchedAt: 0,
    lastSync: 0,
    version: 1,
  };
  await upsertArchive([alice, alice], archive, user);
  await upsertArchive([alice], archive, user);
  await upsertArchive(
    [bob],
    { ...archive, id: "bob:2026:1", username: "bob" },
    { ...user, username: "bob" },
  );
  expect(await getGames("alice")).toHaveLength(1);
  expect(await getGames("bob")).toHaveLength(1);
  expect((await getGames("bob"))[0].playerColor).toBe("black");
});
it("creates existing and additive analysis stores", async () =>
  expect([...(await database()).objectStoreNames]).toEqual([
    "analysisQueue",
    "analyticsCache",
    "archives",
    "engineAnalysis",
    "games",
    "mistakeReviews",
    "mistakes",
    "moveTimeAnalysis",
    "puzzleAttempts",
    "puzzleTrackingState",
    "users",
  ]));
it("caches closed months but refreshes current month after five minutes", () => {
  const now = new Date(2026, 8, 30, 12);
  expect(shouldRefreshArchive(now.getTime() - 60000, 2026, 9, now)).toBe(false);
  expect(shouldRefreshArchive(now.getTime() - 360000, 2026, 9, now)).toBe(true);
  expect(
    shouldRefreshArchive(new Date(2026, 7, 2).getTime(), 2026, 6, now, true),
  ).toBe(false);
});
it("refreshes a previous month once after rollover", () => {
  const now = new Date(2026, 9, 1, 12);
  expect(
    shouldRefreshArchive(new Date(2026, 8, 30).getTime(), 2026, 9, now),
  ).toBe(true);
  expect(
    shouldRefreshArchive(new Date(2026, 9, 1, 10).getTime(), 2026, 9, now),
  ).toBe(false);
});
