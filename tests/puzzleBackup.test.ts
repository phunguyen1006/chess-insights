import "fake-indexeddb/auto";
import { IDBObjectStore as FakeObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_PUZZLE_BACKUP_ATTEMPTS,
  MAX_PUZZLE_BACKUP_BYTES,
  PUZZLE_BACKUP_FORMAT,
  PUZZLE_BACKUP_SCHEMA,
  parsePuzzleBackup,
  serializePuzzleBackup,
  type PuzzleBackup,
} from "../src/shared/puzzleBackup";
import { localDate } from "../src/shared/dates";
import type { PuzzleAttempt } from "../src/shared/types";
import {
  database,
  idbResult,
  transactionDone,
} from "../src/data/storage/database";
import {
  exportPuzzleBackup,
  importPuzzleBackup,
} from "../src/data/storage/puzzleBackupRepository";
import {
  puzzleSnapshot,
  savePuzzleAttempt,
  startPuzzleTracking,
} from "../src/data/storage/puzzleRepository";

const now = Date.now();
function attempt(username = "backup-user", id = "one"): PuzzleAttempt {
  return {
    id: `${username}:${id}`,
    username,
    puzzleId: "123",
    attemptedAt: now - 10_000,
    localDate: localDate(new Date(now - 10_000)),
    result: "solved",
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingChange: 10,
    puzzleRating: 1400,
    source: "live_tracker",
    createdAt: now - 5_000,
  };
}
function backup(
  username = "backup-user",
  attempts = [attempt(username)],
): PuzzleBackup {
  return {
    format: PUZZLE_BACKUP_FORMAT,
    schemaVersion: PUZZLE_BACKUP_SCHEMA,
    extensionVersion: "0.1.7",
    exportedAt: now,
    username,
    tracking: {
      username,
      puzzleTrackingStartedAt: now - 86_400_000,
      puzzleTrackingStartedLocalDate: localDate(new Date(now - 86_400_000)),
      revision: attempts.length,
    },
    attempts,
  };
}

describe("puzzle backup validation", () => {
  it("round-trips nullable metadata, original recorded dates and empty accounts", () => {
    const nullable = {
      ...attempt(),
      puzzleId: null,
      ratingBefore: null,
      ratingAfter: null,
      ratingChange: null,
      puzzleRating: null,
    };
    const value = backup("backup-user", [nullable]);
    expect(
      parsePuzzleBackup(serializePuzzleBackup(value, now), "BACKUP-USER", now),
    ).toEqual(value);
    const empty = { ...backup("empty-backup", []), tracking: null };
    expect(
      parsePuzzleBackup(serializePuzzleBackup(empty, now), "empty-backup", now),
    ).toEqual(empty);
  });
  it("deduplicates identical entries but rejects conflicting entries with the same ID", () => {
    const a = attempt();
    expect(
      parsePuzzleBackup(
        JSON.stringify(backup("backup-user", [a, a])),
        "backup-user",
        now,
      ).attempts,
    ).toEqual([a]);
    expect(() =>
      parsePuzzleBackup(
        JSON.stringify(backup("backup-user", [a, { ...a, result: "failed" }])),
        "backup-user",
        now,
      ),
    ).toThrow("conflicting");
  });
  it.each([
    [
      "account mismatch",
      (b: PuzzleBackup) => ({ ...b, username: "someone-else" }),
    ],
    [
      "attempt namespace",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], id: "someone-else:one" }],
      }),
    ],
    [
      "tracking account",
      (b: PuzzleBackup) => ({
        ...b,
        tracking: { ...b.tracking!, username: "someone-else" },
      }),
    ],
    ["unsupported version", (b: PuzzleBackup) => ({ ...b, schemaVersion: 2 })],
    ["unsupported fields", (b: PuzzleBackup) => ({ ...b, analysisQueue: [] })],
    [
      "invalid calendar date",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], localDate: "2026-02-30" }],
      }),
    ],
    [
      "future timestamp",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], attemptedAt: now + 120_000 }],
      }),
    ],
    [
      "coerced result",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], result: ["solved"] }],
      }),
    ],
    [
      "rating mismatch",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], ratingChange: 99 }],
      }),
    ],
    [
      "unsafe ID",
      (b: PuzzleBackup) => ({
        ...b,
        attempts: [{ ...b.attempts[0], id: "backup-user:bad\u0000id" }],
      }),
    ],
    [
      "malformed tracking",
      (b: PuzzleBackup) => ({
        ...b,
        tracking: { ...b.tracking!, revision: -1 },
      }),
    ],
  ])("rejects %s before any import", (_label, change) => {
    expect(() =>
      parsePuzzleBackup(JSON.stringify(change(backup())), "backup-user", now),
    ).toThrow();
  });
  it("rejects malformed JSON, NaN before serialization, and real UTF-8 byte/item limits", () => {
    expect(() => parsePuzzleBackup("{", "backup-user", now)).toThrow(
      "valid JSON",
    );
    const b = backup();
    expect(() =>
      serializePuzzleBackup(
        { ...b, attempts: [{ ...b.attempts[0], ratingAfter: NaN }] },
        now,
      ),
    ).toThrow("rating");
    expect(() =>
      parsePuzzleBackup(
        "é".repeat(MAX_PUZZLE_BACKUP_BYTES / 2 + 1),
        "backup-user",
        now,
      ),
    ).toThrow("20 MB");
    expect(() =>
      serializePuzzleBackup(
        {
          ...b,
          attempts: Array(MAX_PUZZLE_BACKUP_ATTEMPTS + 1).fill(b.attempts[0]),
        },
        now,
      ),
    ).toThrow("50,000");
  });
});

describe("transactional puzzle backup persistence", () => {
  it("exports one consistent account snapshot without other accounts or review/queue data", async () => {
    const username = "backup-export";
    await startPuzzleTracking(username, now - 60_000);
    await savePuzzleAttempt(attempt(username));
    await startPuzzleTracking("backup-other", now - 60_000);
    await savePuzzleAttempt(attempt("backup-other"));
    const result = await exportPuzzleBackup(username, Date.now());
    expect(result.username).toBe(username);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].username).toBe(username);
    expect(result.tracking?.revision).toBe(1);
    expect(Object.keys(result).sort()).toEqual([
      "attempts",
      "exportedAt",
      "extensionVersion",
      "format",
      "schemaVersion",
      "tracking",
      "username",
    ]);
    expect(parsePuzzleBackup(serializePuzzleBackup(result), username)).toEqual(
      result,
    );
  });
  it("merges missing attempts idempotently and preserves existing IDs and the newer Clear boundary", async () => {
    const username = "backup-merge";
    const state = await startPuzzleTracking(username, now - 20_000);
    await savePuzzleAttempt(attempt(username, "existing"));
    const original = (await puzzleSnapshot(username)).attempts[0];
    const old = {
      ...attempt(username, "older"),
      attemptedAt: now - 50_000,
      localDate: localDate(new Date(now - 50_000)),
      createdAt: now - 45_000,
    };
    const text = serializePuzzleBackup(
      backup(username, [old, { ...original, result: "failed" }]),
      Date.now(),
    );
    const result = await importPuzzleBackup(username, text, Date.now());
    expect(result).toMatchObject({ imported: 1, skipped: 1, total: 2 });
    expect(result.tracking?.puzzleTrackingStartedAt).toBe(
      state.puzzleTrackingStartedAt,
    );
    expect(result.tracking?.revision).toBe(2);
    expect(
      (await puzzleSnapshot(username)).attempts.find(
        (a) => a.id === original.id,
      ),
    ).toEqual(original);
    expect(await importPuzzleBackup(username, text, Date.now())).toMatchObject({
      imported: 0,
      skipped: 2,
      total: 2,
      tracking: result.tracking,
    });
    const exported = await exportPuzzleBackup(username, Date.now());
    expect(exported.attempts.map((a) => a.id)).toEqual([old.id, original.id]);
  });
  it("starts live coverage at import time instead of claiming that an old backup covers the gap", async () => {
    const username = "backup-new-device";
    const result = await importPuzzleBackup(
      username,
      serializePuzzleBackup(backup(username), now),
      now,
    );
    expect(result.tracking).toMatchObject({
      puzzleTrackingStartedAt: now,
      puzzleTrackingStartedLocalDate: localDate(new Date(now)),
      revision: 1,
    });
    expect(result.tracking!.puzzleTrackingStartedAt).toBeGreaterThan(
      backup(username).tracking!.puzzleTrackingStartedAt,
    );
    expect((await puzzleSnapshot(username)).attempts).toEqual(
      backup(username).attempts,
    );
    expect(
      await savePuzzleAttempt({
        ...attempt(username, "queued-before-import"),
        attemptedAt: now - 1,
      }),
    ).toBe(false);
  });
  it("rejects a foreign-account ID collision without partial writes or touching any other store", async () => {
    const username = "backup-collision";
    const db = await database();
    const tx = db.transaction(
      ["puzzleAttempts", "games", "mistakeReviews", "analysisQueue"],
      "readwrite",
    );
    const done = transactionDone(tx);
    tx.objectStore("puzzleAttempts").put({
      ...attempt(username, "collision"),
      username: "another-account",
    });
    for (const store of ["games", "mistakeReviews", "analysisQueue"])
      tx.objectStore(store).put({
        id: `${username}:sentinel`,
        username,
        value: "preserved",
      });
    await done;
    await expect(
      importPuzzleBackup(
        username,
        serializePuzzleBackup(
          backup(username, [
            attempt(username, "new"),
            attempt(username, "collision"),
          ]),
          now,
        ),
        now,
      ),
    ).rejects.toThrow("another account");
    expect(await puzzleSnapshot(username)).toEqual({
      attempts: [],
      tracking: null,
    });
    for (const store of ["games", "mistakeReviews", "analysisQueue"])
      expect(
        await idbResult(
          db.transaction(store).objectStore(store).get(`${username}:sentinel`),
        ),
      ).toMatchObject({ value: "preserved" });
  });
  it("rolls back earlier inserted attempts when a later write fails", async () => {
    const username = "backup-write-failure";
    const initial = await startPuzzleTracking(username, now - 60_000);
    const add = FakeObjectStore.prototype.add;
    const mock = vi
      .spyOn(FakeObjectStore.prototype, "add")
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (
          this.name === "puzzleAttempts" &&
          (value as PuzzleAttempt).id === `${username}:quota`
        )
          throw new DOMException(
            "Storage quota exhausted",
            "QuotaExceededError",
          );
        return add.call(this, value, key);
      });
    try {
      await expect(
        importPuzzleBackup(
          username,
          serializePuzzleBackup(
            backup(username, [
              attempt(username, "first"),
              attempt(username, "quota"),
            ]),
            now,
          ),
          now,
        ),
      ).rejects.toThrow("quota");
      expect(await puzzleSnapshot(username)).toEqual({
        attempts: [],
        tracking: initial,
      });
    } finally {
      mock.mockRestore();
    }
  });
  it("serializes import against live saves and another import without losing attempts or double-counting revision", async () => {
    const username = "backup-concurrent";
    await startPuzzleTracking(username, now - 60_000);
    const shared = attempt(username, "shared");
    const text = serializePuzzleBackup(
      backup(username, [shared, attempt(username, "file-only")]),
      now,
    );
    await Promise.all([
      importPuzzleBackup(username, text, Date.now()),
      savePuzzleAttempt(shared),
      savePuzzleAttempt(attempt(username, "live-only")),
      importPuzzleBackup(username, text, Date.now()),
    ]);
    const result = await puzzleSnapshot(username);
    expect(result.attempts.map((a) => a.id).sort()).toEqual([
      `${username}:file-only`,
      `${username}:live-only`,
      `${username}:shared`,
    ]);
    expect(result.tracking?.revision).toBe(3);
  });
});
