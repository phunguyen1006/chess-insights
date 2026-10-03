export type TimeClass = "rapid" | "blitz" | "bullet" | "daily" | "unknown";
export type Result = "win" | "draw" | "loss";
export type Color = "white" | "black";
export interface RawPlayer {
  username?: string;
  rating?: number;
  result?: string;
}
export interface RawGame {
  uuid?: string;
  url?: string;
  end_time?: number;
  time_class?: string;
  time_control?: string;
  rated?: boolean;
  rules?: string;
  white?: RawPlayer;
  black?: RawPlayer;
  pgn?: string;
  eco?: string;
}
export interface NormalizedGame {
  id: string;
  url: string;
  username: string;
  endTime: number;
  localDate: string;
  timeClass: TimeClass;
  timeControl: string;
  rated: boolean;
  rules: string;
  playerColor: Color;
  result: Result;
  rawPlayerResult: string;
  rawOpponentResult: string;
  termination: string;
  playerRating: number | null;
  opponentRating: number | null;
  opponentUsername: string | null;
  whiteUsername: string | null;
  blackUsername: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  eco: string | null;
  openingName: string | null;
  variation: string | null;
  pgn: string | null;
  /** Opaque source fingerprint carried by snapshots that redact the PGN. */
  durationFingerprint?: string;
}
export interface Archive {
  id: string;
  username: string;
  year: number;
  month: number;
  lastFetchedAt: number;
  gameCount: number;
  syncStatus: "synced";
  timezone: string;
  fingerprint: string;
}
export interface UserRecord {
  username: string;
  archives: string[];
  indexFetchedAt: number;
  lastSync: number;
  version: number;
  lastManualRefresh?: number;
  profile?: Record<string, unknown>;
}
export interface Settings {
  username?: string;
  trackPuzzleActivity?: boolean;
}
export interface PuzzleAttempt {
  id: string;
  username: string;
  puzzleId: string | null;
  attemptedAt: number;
  localDate: string;
  result: "solved" | "failed" | "unknown";
  ratingBefore: number | null;
  ratingAfter: number | null;
  ratingChange: number | null;
  puzzleRating: number | null;
  source: "live_tracker" | "history_bootstrap";
  createdAt: number;
}
export interface PuzzleTrackingState {
  username: string;
  puzzleTrackingStartedAt: number;
  puzzleTrackingStartedLocalDate: string;
  revision: number;
}
export interface PuzzleSnapshot {
  attempts: PuzzleAttempt[];
  tracking: PuzzleTrackingState | null;
}
export interface Snapshot {
  games: NormalizedGame[];
  years: number[];
  lastSync: number;
  version: number;
}
export interface Filters {
  timeClass: string;
  rated: string;
  color: string;
  result: string;
  start: string;
  end: string;
}
export interface ApiError {
  code: string;
  message: string;
}
export type Reply<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type Request =
  | { type: "ci:puzzle-export"; username: string }
  | { type: "ci:puzzle-import"; username: string; text: string }
  | { type: "ci:puzzles"; username: string }
  | { type: "ci:puzzle-start"; username: string }
  | { type: "ci:puzzle-save"; attempt: PuzzleAttempt }
  | { type: "ci:puzzle-setting"; enabled: boolean }
  | { type: "ci:puzzle-clear"; username: string }
  | { type: "ci:durations"; username: string; action: "cache" | "analyze" }
  | {
      type: "ci:analysis";
      username: string;
      action: "state" | "clocks" | "enqueue" | "pause" | "cancel" | "review";
      ids?: string[];
      grade?: import("../analysis/types").Grade;
      correct?: boolean;
      mistakeId?: string;
      includeClocks?: boolean;
      force?: boolean;
    }
  | { type: "ci:engine-open"; username: string }
  | { type: "ci:engine-stop"; username: string }
  | { type: "ci:engine-status"; username: string }
  | { type: "ci:engine-test"; username: string }
  | { type: "ci:replay-test"; username: string }
  | { type: "ci:engine-claim"; token: string }
  | { type: "ci:engine-guard"; token: string }
  | { type: "ci:engine-release"; token: string }
  | { type: "ci:connect"; username: string }
  | { type: "ci:settings" }
  | { type: "ci:snapshot"; username: string }
  | { type: "ci:sync"; username: string; years: number[]; force?: boolean };
