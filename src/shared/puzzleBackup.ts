import type { PuzzleAttempt, PuzzleTrackingState } from "./types";

export const PUZZLE_BACKUP_FORMAT = "chess-insights-puzzles";
export const PUZZLE_BACKUP_SCHEMA = 1;
export const MAX_PUZZLE_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_PUZZLE_BACKUP_ATTEMPTS = 50_000;

export interface PuzzleBackup {
  format: typeof PUZZLE_BACKUP_FORMAT;
  schemaVersion: typeof PUZZLE_BACKUP_SCHEMA;
  extensionVersion: string;
  exportedAt: number;
  username: string;
  tracking: PuzzleTrackingState | null;
  attempts: PuzzleAttempt[];
}
export interface PuzzleImportResult {
  username: string;
  imported: number;
  skipped: number;
  total: number;
  tracking: PuzzleTrackingState | null;
}
export class PuzzleBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PuzzleBackupError";
  }
}

function invalid(message: string): never {
  throw new PuzzleBackupError(`Invalid puzzle backup: ${message}`);
}
function account(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{2,30}$/.test(value))
    invalid("username is not valid.");
  return value.toLowerCase();
}
function object(value: unknown, fields: string[], label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${label} must be an object.`);
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !fields.includes(key)) ||
    fields.some((key) => !Object.hasOwn(record, key))
  )
    invalid(`${label} has missing or unsupported fields.`);
  return record;
}
function timestamp(value: unknown, ceiling: number, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > ceiling + 60_000 ||
    !Number.isFinite(new Date(value).getTime())
  )
    invalid(`${label} is not a valid timestamp.`);
  return value;
}
function recordedDate(value: unknown, at: number, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    invalid(`${label} is not a calendar date.`);
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    invalid(`${label} is not a calendar date.`);
  // Preserve the date recorded on the source device, including a different
  // timezone, while rejecting dates unrelated to the corresponding timestamp.
  const earliest = new Date(at - 14 * 60 * 60_000).toISOString().slice(0, 10);
  const latest = new Date(at + 14 * 60 * 60_000).toISOString().slice(0, 10);
  if (value < earliest || value > latest)
    invalid(`${label} does not match its recorded timestamp.`);
  return value;
}
function text(value: unknown, max: number, label: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    invalid(`${label} is not a valid identifier.`);
  return value;
}
function rating(value: unknown, signed: boolean, label: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (signed ? -100_000 : 0) ||
    value > 100_000
  )
    invalid(`${label} is not a valid rating value.`);
  return value;
}
function trackingState(
  value: unknown,
  username: string,
  exportedAt: number,
): PuzzleTrackingState | null {
  if (value === null) return null;
  const state = object(
    value,
    [
      "username",
      "puzzleTrackingStartedAt",
      "puzzleTrackingStartedLocalDate",
      "revision",
    ],
    "tracking state",
  );
  if (state.username !== username)
    invalid("tracking state belongs to another account.");
  const startedAt = timestamp(
    state.puzzleTrackingStartedAt,
    exportedAt,
    "tracking start",
  );
  if (
    typeof state.revision !== "number" ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0
  )
    invalid("tracking revision is not valid.");
  return {
    username,
    puzzleTrackingStartedAt: startedAt,
    puzzleTrackingStartedLocalDate: recordedDate(
      state.puzzleTrackingStartedLocalDate,
      startedAt,
      "tracking date",
    ),
    revision: state.revision,
  };
}
function attemptRecord(
  value: unknown,
  username: string,
  exportedAt: number,
): PuzzleAttempt {
  const record = object(
    value,
    [
      "id",
      "username",
      "puzzleId",
      "attemptedAt",
      "localDate",
      "result",
      "ratingBefore",
      "ratingAfter",
      "ratingChange",
      "puzzleRating",
      "source",
      "createdAt",
    ],
    "puzzle attempt",
  );
  if (record.username !== username)
    invalid("an attempt belongs to another account.");
  const id = text(record.id, 512, "attempt ID");
  if (!id.startsWith(`${username}:`) || id.length === username.length + 1)
    invalid("attempt ID does not belong to this account.");
  const attemptedAt = timestamp(record.attemptedAt, exportedAt, "attempt time");
  const createdAt = timestamp(record.createdAt, exportedAt, "creation time");
  if (createdAt + 60_000 < attemptedAt)
    invalid("creation time precedes the attempt.");
  if (
    typeof record.result !== "string" ||
    !["solved", "failed", "unknown"].includes(record.result)
  )
    invalid("attempt result is not supported.");
  if (
    typeof record.source !== "string" ||
    !["live_tracker", "history_bootstrap"].includes(record.source)
  )
    invalid("attempt source is not supported.");
  const before = rating(record.ratingBefore, false, "rating before");
  const after = rating(record.ratingAfter, false, "rating after");
  const change = rating(record.ratingChange, true, "rating change");
  if (
    before !== null &&
    after !== null &&
    change !== null &&
    after - before !== change
  )
    invalid("rating change does not match before and after ratings.");
  return {
    id,
    username,
    puzzleId:
      record.puzzleId === null ? null : text(record.puzzleId, 128, "puzzle ID"),
    attemptedAt,
    localDate: recordedDate(record.localDate, attemptedAt, "attempt date"),
    result: record.result as PuzzleAttempt["result"],
    ratingBefore: before,
    ratingAfter: after,
    ratingChange: change,
    puzzleRating: rating(record.puzzleRating, false, "puzzle rating"),
    source: record.source as PuzzleAttempt["source"],
    createdAt,
  };
}
function validate(
  value: unknown,
  expectedUsername: string,
  now: number,
): PuzzleBackup {
  const backup = object(
    value,
    [
      "format",
      "schemaVersion",
      "extensionVersion",
      "exportedAt",
      "username",
      "tracking",
      "attempts",
    ],
    "backup",
  );
  if (
    backup.format !== PUZZLE_BACKUP_FORMAT ||
    backup.schemaVersion !== PUZZLE_BACKUP_SCHEMA
  )
    invalid("format or schema version is not supported.");
  const username = account(backup.username);
  if (backup.username !== username || username !== account(expectedUsername))
    invalid(
      "backup belongs to another account. Switch to its account before importing.",
    );
  if (
    typeof backup.extensionVersion !== "string" ||
    !/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:\.\d{1,5})?$/.test(backup.extensionVersion)
  )
    invalid("extension version is not valid.");
  const exportedAt = timestamp(backup.exportedAt, now, "export time");
  if (!Array.isArray(backup.attempts)) invalid("attempts must be an array.");
  if (backup.attempts.length > MAX_PUZZLE_BACKUP_ATTEMPTS)
    throw new PuzzleBackupError(
      `Puzzle backup exceeds ${MAX_PUZZLE_BACKUP_ATTEMPTS.toLocaleString()} attempts. Keep this file and contact support before importing.`,
    );
  const records = new Map<string, PuzzleAttempt>();
  for (const value of backup.attempts) {
    const record = attemptRecord(value, username, exportedAt);
    const previous = records.get(record.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record))
      invalid("duplicate attempt IDs contain conflicting records.");
    records.set(record.id, record);
  }
  return {
    format: PUZZLE_BACKUP_FORMAT,
    schemaVersion: PUZZLE_BACKUP_SCHEMA,
    extensionVersion: backup.extensionVersion,
    exportedAt,
    username,
    tracking: trackingState(backup.tracking, username, exportedAt),
    attempts: [...records.values()].sort(
      (a, b) => a.attemptedAt - b.attemptedAt || a.id.localeCompare(b.id),
    ),
  };
}
function checkBytes(text: string) {
  if (
    text.length > MAX_PUZZLE_BACKUP_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_PUZZLE_BACKUP_BYTES
  )
    throw new PuzzleBackupError(
      "Puzzle backup exceeds the 20 MB limit. Keep your history and contact support; do not clear data to make the backup fit.",
    );
}
export function parsePuzzleBackup(
  text: string,
  expectedUsername: string,
  now = Date.now(),
): PuzzleBackup {
  if (typeof text !== "string") invalid("file contents must be text.");
  checkBytes(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    invalid("file is not valid JSON.");
  }
  return validate(value, expectedUsername, now);
}
export function serializePuzzleBackup(
  backup: PuzzleBackup,
  now = Date.now(),
): string {
  const valid = validate(backup, backup.username, now);
  const text = JSON.stringify(valid, null, 2);
  checkBytes(text);
  return text;
}
