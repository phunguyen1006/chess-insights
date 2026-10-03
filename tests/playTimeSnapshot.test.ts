import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../src/dev/data/public-games.json";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import type { NormalizedGame } from "../src/shared/types";

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
async function storeGames(games: NormalizedGame[]) {
  const storage = await import("../src/data/storage/database");
  db = await storage.database();
  const tx = db.transaction("games", "readwrite"),
    done = storage.transactionDone(tx);
  for (const game of games) tx.objectStore("games").put(game);
  await done;
}

it("retains public Play Time and Sessions through the production PGN-redacted snapshot", async () => {
  const games = fixture.games
    .map((g) => normalizeGame(g, fixture.username))
    .filter((g): g is NormalizedGame => g !== null)
    .sort((a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id));
  const otherGame = {
    ...games[0],
    id: "other-account:separate-game",
    username: "other-account",
  };
  await storeGames([...games, otherGame]);
  const parser = await import("../src/analysis/playTime"),
    parse = vi.spyOn(parser, "parseGameDuration");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { snapshot, gameForSnapshot } =
    await import("../src/data/sync/syncManager");
  const { ensureGameDurations, durationSnapshot } =
    await import("../src/data/storage/durationRepository");
  const { playTimeSummary, sessionAnalytics } =
    await import("../src/analytics/playTime");
  const { getGames } = await import("../src/data/storage/gameRepository");

  const production = await snapshot(fixture.username);
  expect(production.games).toHaveLength(193);
  expect(production.games.every((g) => g.pgn === null)).toBe(true);
  expect(production.games.every((g) => !!g.durationFingerprint)).toBe(true);
  expect(production.games).toEqual(
    (await getGames(fixture.username)).map(gameForSnapshot),
  );
  expect(await durationSnapshot(fixture.username)).toEqual([]);
  expect(parse).not.toHaveBeenCalled(); // A homepage snapshot does not parse durations.

  const records = await ensureGameDurations(fixture.username);
  const summary = playTimeSummary(production.games, records),
    sessions = sessionAnalytics(production.games, records);
  expect(summary).toMatchObject({
    selectedGames: 193,
    eligibleRealtimeGames: 72,
    withDuration: 72,
    unavailable: 0,
    coverage: 1,
    totalRecordedSeconds: 11573,
    dailyExcluded: 121,
  });
  expect(sessions).toMatchObject({
    totalSessions: 53,
    withIntervals: 72,
    coverage: 1,
  });
  expect(summary.averageDurationSeconds).toBe(11573 / 72);
  expect(await durationSnapshot("other-account")).toEqual([]);
  expect((await snapshot("other-account")).games.map((g) => g.id)).toEqual([
    otherGame.id,
  ]);
  expect(
    playTimeSummary([gameForSnapshot(otherGame)], records).withDuration,
  ).toBe(0);
  expect((await getGames(fixture.username)).map((g) => g.pgn)).toEqual(
    games.map((g) => g.pgn),
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects stale records after a full PGN changes even when its supplied metadata is stale", async () => {
  const raw = fixture.games.find((g) => g.url.endsWith("147462360030"))!;
  const game = normalizeGame(raw, fixture.username)!;
  await storeGames([game]);
  const { snapshot, gameForSnapshot } =
    await import("../src/data/sync/syncManager");
  const { ensureGameDurations } =
    await import("../src/data/storage/durationRepository");
  const { durationFingerprint } = await import("../src/analysis/playTime");
  const { playTimeSummary, sessionAnalytics } =
    await import("../src/analytics/playTime");
  const records = await ensureGameDurations(fixture.username);
  const original = (await snapshot(fixture.username)).games;
  expect(playTimeSummary(original, records).withDuration).toBe(1);
  expect(original[0].durationFingerprint).toBe(records[0].fingerprint);
  expect(sessionAnalytics(original, records).withIntervals).toBe(1);

  const changed = {
    ...game,
    pgn: '[SourceRevision "2"]\n' + game.pgn,
    durationFingerprint: records[0].fingerprint,
  };
  expect(durationFingerprint(changed)).not.toBe(records[0].fingerprint);
  expect(playTimeSummary([changed], records).withDuration).toBe(0);
  await storeGames([changed]);
  const refreshed = (await snapshot(fixture.username)).games;
  expect(refreshed[0].durationFingerprint).toBe(durationFingerprint(changed));
  expect(playTimeSummary(refreshed, records).withDuration).toBe(0);
  expect(sessionAnalytics(refreshed, records).withIntervals).toBe(0);

  const freshRecords = await ensureGameDurations(fixture.username);
  expect(freshRecords[0].durationSeconds).toBe(216);
  expect(playTimeSummary(refreshed, freshRecords).withDuration).toBe(1);
  expect(sessionAnalytics(refreshed, freshRecords).withIntervals).toBe(1);
  expect(
    playTimeSummary(refreshed, [{ ...freshRecords[0], parserVersion: 0 }])
      .withDuration,
  ).toBe(0);
  expect(
    playTimeSummary(refreshed, [
      { ...freshRecords[0], username: "other-account" },
    ]).withDuration,
  ).toBe(0);
  expect(
    playTimeSummary(
      [{ ...gameForSnapshot(changed), durationFingerprint: undefined }],
      freshRecords,
    ).withDuration,
  ).toBe(0);
});
