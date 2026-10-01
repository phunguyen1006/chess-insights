import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import type { PuzzleAttempt, NormalizedGame } from "../src/shared/types";
import { localDate } from "../src/shared/dates";
import {
  clearPuzzleHistory,
  puzzleSnapshot,
  savePuzzleAttempt,
  startPuzzleTracking,
} from "../src/data/storage/puzzleRepository";
import { database, idbResult } from "../src/data/storage/database";
import {
  activityLevel,
  combinedActivity,
  combinedLevels,
  getCombinedActivityLevel,
  puzzleActivity,
  puzzleHistoryKnown,
  puzzleResults,
} from "../src/analytics/puzzles";
const attempt = (
  id: string,
  date = "2026-09-30",
  result: PuzzleAttempt["result"] = "solved",
  username = "alice",
): PuzzleAttempt => ({
  id: `${username}:${id}`,
  username,
  puzzleId: "123",
  attemptedAt: new Date(`${date}T12:00:00`).getTime(),
  localDate: date,
  result,
  ratingBefore: null,
  ratingAfter: null,
  ratingChange: null,
  puzzleRating: null,
  source: "live_tracker",
  createdAt: Date.now(),
});
const game = (date: string) => ({ localDate: date }) as NormalizedGame;
describe("puzzle persistence", () => {
  it("starts once and stores exactly one immutable completion per session", async () => {
    const a = await startPuzzleTracking(
      "alice",
      new Date("2026-09-29T12:00:00").getTime(),
    );
    expect(await startPuzzleTracking("alice")).toEqual(a);
    expect(await savePuzzleAttempt(attempt("1"))).toBe(true);
    expect(await savePuzzleAttempt(attempt("1", "2026-09-30", "failed"))).toBe(
      false,
    );
    await savePuzzleAttempt(attempt("2", "2026-09-30", "failed"));
    await savePuzzleAttempt({
      ...attempt("3"),
      puzzleId: "456",
      result: "unknown",
      ratingAfter: 1500,
      ratingChange: 0,
    });
    const s = await puzzleSnapshot("alice");
    expect(s.attempts).toHaveLength(3);
    expect(s.attempts[0].result).toBe("solved");
    expect(s.tracking?.revision).toBe(3);
    expect(s.attempts[0].localDate).toBe(
      localDate(new Date(s.attempts[0].attemptedAt)),
    );
  });
  it("separates accounts and clearing puzzles preserves all other stores", async () => {
    await startPuzzleTracking("bob", new Date("2026-09-29T12:00:00").getTime());
    await savePuzzleAttempt(attempt("1", "2026-09-30", "unknown", "bob"));
    const db = await database();
    const tx = db.transaction("engineAnalysis", "readwrite");
    tx.objectStore("engineAnalysis").put({
      id: "preserve-engine",
      username: "alice",
      value: 42,
    });
    await clearPuzzleHistory("alice");
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(0);
    expect((await puzzleSnapshot("bob")).attempts).toHaveLength(1);
    expect(
      await idbResult(
        db
          .transaction("engineAnalysis")
          .objectStore("engineAnalysis")
          .get("preserve-engine"),
      ),
    ).toMatchObject({ value: 42 });
    expect([
      ...db.transaction("puzzleAttempts").objectStore("puzzleAttempts")
        .indexNames,
    ]).toEqual(["attemptedAt", "localDate", "username"]);
  });
  it("rejects uninitialized accounts and invalid timestamps", async () => {
    await expect(
      savePuzzleAttempt(attempt("x", "2026-09-30", "solved", "untracked")),
    ).rejects.toThrow("not started");
    await expect(
      savePuzzleAttempt({ ...attempt("x"), attemptedAt: NaN }),
    ).rejects.toThrow("Invalid");
  });
  it("does not replay a completion queued before clear into newly started history", async () => {
    const before = new Date("2026-09-29T12:00:00").getTime();
    await startPuzzleTracking("clear-race", before);
    const queued = attempt("queued", "2026-09-30", "solved", "clear-race");
    await savePuzzleAttempt(queued);
    await clearPuzzleHistory("clear-race");
    await startPuzzleTracking("clear-race", queued.attemptedAt + 1);
    expect(await savePuzzleAttempt(queued)).toBe(false);
    const snapshot = await puzzleSnapshot("clear-race");
    expect(snapshot.attempts).toEqual([]);
    expect(snapshot.tracking?.revision).toBe(0);
    expect(
      await savePuzzleAttempt({
        ...queued,
        id: `${queued.id}-new`,
        attemptedAt: queued.attemptedAt + 2,
      }),
    ).toBe(true);
  });
});
describe("combined activity", () => {
  it("unions days and streaks without double-counting overlaps", () => {
    const s = combinedActivity(
      [game("2026-09-28"), game("2026-09-30")],
      [attempt("1", "2026-09-29"), attempt("2", "2026-09-30")],
      "2026-09-30",
    );
    expect(s).toMatchObject({
      activeDays: 3,
      current: 3,
      longest: 3,
      games: 2,
      puzzles: 2,
    });
    expect(combinedActivity([], [], "2026-09-30")).toMatchObject({
      activeDays: 0,
      current: 0,
      longest: 0,
    });
  });
  it.each([
    [0, 4, 4],
    [4, 0, 4],
    [2, 3, 3],
    [3, 2, 3],
    [0, 0, 0],
  ])("uses max(%i,%i) = %i", (a, b, c) =>
    expect(getCombinedActivityLevel(a, b)).toBe(c),
  );
  it("normalizes independently and preserves game color before puzzle coverage", () => {
    const games = [game("2026-09-01")],
      puzzles = Array.from({ length: 50 }, (_, i) =>
        attempt(String(i), "2026-09-30"),
      );
    expect(combinedLevels(games, puzzles).get("2026-09-01")).toBe(
      activityLevel(1, [1]),
    );
    expect(puzzleHistoryKnown("2026-09-01", "2026-09-30", "2026-09-30")).toBe(
      false,
    );
    expect(puzzleHistoryKnown("2026-09-30", "2026-09-30", "2026-09-30")).toBe(
      true,
    );
    expect(puzzleHistoryKnown("2026-10-01", "2026-09-30", "2026-09-30")).toBe(
      false,
    );
  });
  it("excludes unknown results from success rate and requires a record sample", () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => attempt(`s${i}`)),
      ...Array.from({ length: 2 }, (_, i) =>
        attempt(`f${i}`, "2026-09-30", "failed"),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        attempt(`u${i}`, "2026-09-30", "unknown"),
      ),
    ];
    expect(puzzleResults(list)).toMatchObject({
      attempts: 13,
      successRate: 80,
      resolved: 10,
    });
    expect(puzzleActivity([attempt("single")]).best).toBeUndefined();
    expect(puzzleActivity(list).best?.successRate).toBe(80);
    expect(
      puzzleResults([attempt("u", "2026-09-30", "unknown")]).successRate,
    ).toBeNull();
  });
});
