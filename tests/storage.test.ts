import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
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
it("does not freeze a closing month until the PubAPI cache window has elapsed", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  expect(
    shouldRefreshArchive(Date.parse("2026-09-30T23:00:00Z"), 2026, 9, now),
  ).toBe(true);
  expect(
    shouldRefreshArchive(Date.parse("2026-10-01T10:00:00Z"), 2026, 9, now),
  ).toBe(true);
  expect(
    shouldRefreshArchive(Date.parse("2026-10-01T11:59:00Z"), 2026, 9, now),
  ).toBe(false);
  expect(
    shouldRefreshArchive(
      Date.parse("2026-10-01T23:59:00Z"),
      2026,
      9,
      new Date("2026-10-02T00:01:00Z"),
    ),
  ).toBe(true);
  expect(
    shouldRefreshArchive(
      Date.parse("2026-10-02T00:01:00Z"),
      2026,
      9,
      new Date("2026-10-03T00:01:00Z"),
    ),
  ).toBe(false);
});
it("uses UTC archive months when the browser's local month has already changed", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  vi.spyOn(now, "getFullYear").mockReturnValue(2026);
  vi.spyOn(now, "getMonth").mockReturnValue(9);
  expect(shouldRefreshArchive(now.getTime() - 60_000, 2026, 9, now)).toBe(
    false,
  );
  expect(shouldRefreshArchive(now.getTime() - 360_000, 2026, 9, now)).toBe(
    true,
  );
});
