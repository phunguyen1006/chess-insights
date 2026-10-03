import { version as extensionVersion } from "../../../package.json";
import { cleanUsername } from "../api/chessComApi";
import { database, idbResult, transactionDone } from "./database";
import { localDate } from "../../shared/dates";
import {
  MAX_PUZZLE_BACKUP_ATTEMPTS,
  PUZZLE_BACKUP_FORMAT,
  PUZZLE_BACKUP_SCHEMA,
  PuzzleBackupError,
  parsePuzzleBackup,
  serializePuzzleBackup,
  type PuzzleBackup,
  type PuzzleImportResult,
} from "../../shared/puzzleBackup";
import type { PuzzleAttempt, PuzzleTrackingState } from "../../shared/types";

export async function exportPuzzleBackup(
  account: string,
  now = Date.now(),
): Promise<PuzzleBackup> {
  const username = cleanUsername(account);
  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readonly",
  );
  const done = transactionDone(tx);
  const [attempts, tracking] = await Promise.all([
    idbResult(
      tx.objectStore("puzzleAttempts").index("username").getAll(username),
    ) as Promise<PuzzleAttempt[]>,
    idbResult(tx.objectStore("puzzleTrackingState").get(username)) as Promise<
      PuzzleTrackingState | undefined
    >,
  ]);
  await done;
  const backup: PuzzleBackup = {
    format: PUZZLE_BACKUP_FORMAT,
    schemaVersion: PUZZLE_BACKUP_SCHEMA,
    extensionVersion,
    exportedAt: now,
    username,
    tracking: tracking ?? null,
    attempts,
  };
  // Export enforces the same limits as import, so a downloaded file is restorable.
  return parsePuzzleBackup(serializePuzzleBackup(backup, now), username, now);
}
export async function importPuzzleBackup(
  account: string,
  text: string,
  now = Date.now(),
): Promise<PuzzleImportResult> {
  const username = cleanUsername(account);
  const backup = parsePuzzleBackup(text, username, now);
  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readwrite",
  );
  const done = transactionDone(tx);
  try {
    const attemptsStore = tx.objectStore("puzzleAttempts");
    const trackingStore = tx.objectStore("puzzleTrackingState");
    const [existing, current, records] = await Promise.all([
      idbResult(attemptsStore.index("username").getAll(username)) as Promise<
        PuzzleAttempt[]
      >,
      idbResult(trackingStore.get(username)) as Promise<
        PuzzleTrackingState | undefined
      >,
      Promise.all(
        backup.attempts.map(
          (attempt) =>
            idbResult(attemptsStore.get(attempt.id)) as Promise<
              PuzzleAttempt | undefined
            >,
        ),
      ),
    ]);
    const incoming = backup.attempts.filter((attempt, index) => {
      const previous = records[index];
      if (previous && previous.username !== username)
        throw new PuzzleBackupError(
          "Puzzle backup ID collides with another account. No data was imported.",
        );
      return !previous;
    });
    const total = existing.length + incoming.length;
    if (total > MAX_PUZZLE_BACKUP_ATTEMPTS)
      throw new PuzzleBackupError(
        `Merged history would exceed ${MAX_PUZZLE_BACKUP_ATTEMPTS.toLocaleString()} attempts. Keep both copies and contact support; no data was imported.`,
      );
    const tracking: PuzzleTrackingState = current ?? {
      username,
      puzzleTrackingStartedAt: now,
      puzzleTrackingStartedLocalDate: localDate(new Date(now)),
      revision: 0,
    };
    const next = { ...tracking, revision: tracking.revision + incoming.length };
    // Preserve the live capture/Clear boundary. Old backup coverage does not
    // prove that the time between exporting the backup and importing was tracked.
    serializePuzzleBackup(
      {
        format: PUZZLE_BACKUP_FORMAT,
        schemaVersion: PUZZLE_BACKUP_SCHEMA,
        extensionVersion,
        exportedAt: now,
        username,
        tracking: next,
        attempts: [...existing, ...incoming],
      },
      now,
    );
    for (const attempt of incoming) attemptsStore.add(attempt);
    if (!current || incoming.length) trackingStore.put(next);
    await done;
    return {
      username,
      imported: incoming.length,
      skipped: backup.attempts.length - incoming.length,
      total,
      tracking: next,
    };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A failed request may already have aborted. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
