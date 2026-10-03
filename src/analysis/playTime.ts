import { Chess } from "chess.js";
import type { NormalizedGame } from "../shared/types";
import { completedPgn, parsePgnClockData, timeControl } from "./clocks";
import { pgnFingerprint } from "./fingerprint";

export const PLAY_TIME_PARSER_VERSION = 1;
export const MIN_DURATION_CLOCK_COVERAGE = 0.95;
export type DurationSource =
  "pgn_start_end" | "clock_reconstruction" | "emt" | "unavailable";
export interface GameDurationRecord {
  id: string;
  username: string;
  durationSeconds: number | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  source: DurationSource;
  confidence: "exact" | "derived";
  parserVersion: number;
  fingerprint: string;
  reason?: string;
  clockCoverage?: number;
  diagnostic?: string;
}
export const eligibleForPlayTime = (game: NormalizedGame) =>
  game.rules === "chess" &&
  ["rapid", "blitz", "bullet"].includes(game.timeClass);
export const durationFingerprint = (game: NormalizedGame) =>
  // Only redacted snapshots may supply the source fingerprint. Stored/full PGNs
  // must be hashed again so changed source data cannot reuse stale metadata.
  game.pgn === null && game.durationFingerprint
    ? game.durationFingerprint
    : pgnFingerprint(
        `${game.timeClass}\n${game.timeControl}\n${game.rules}\n${game.endTime}\n${game.pgn ?? ""}`,
      );

function tags(pgn: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const match of pgn.matchAll(
    /^\s*\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\]\s*$/gm,
  ))
    output[match[1].toLowerCase()] = match[2].replace(/\\(["\\])/g, "$1");
  return output;
}
function timezone(value: string | undefined): number | null {
  if (!value || /^(?:UTC|GMT|Z)$/i.test(value.trim())) return 0;
  const match = value
    .trim()
    .match(/^(?:(?:UTC|GMT)\s*)?([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return null;
  const hours = Number(match[2]),
    minutes = Number(match[3] ?? 0);
  if (hours > 14 || minutes >= 60 || (hours === 14 && minutes !== 0))
    return null;
  return (match[1] === "+" ? 1 : -1) * (hours * 60 + minutes);
}
function timestamp(
  date: string | undefined,
  time: string | undefined,
  zone?: string,
): number | null {
  const d = date?.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
  const t = time
    ?.trim()
    .match(
      /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)(?:\s*(Z|[+-]\d{2}:?\d{2}))?$/i,
    );
  if (!d || !t) return null;
  const year = Number(d[1]),
    month = Number(d[2]),
    day = Number(d[3]),
    hour = Number(t[1]),
    minute = Number(t[2]),
    second = Number(t[3]),
    offset = timezone(t[4] ?? zone);
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second >= 60 ||
    offset === null
  )
    return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    return null;
  return (
    calendar.getTime() +
    (hour * 3600 + minute * 60 + second) * 1000 -
    offset * 60_000
  );
}
function headerInterval(pgn: string) {
  const h = tags(pgn),
    zone = h.timezone ?? h.utcoffset ?? h.timezoneoffset;
  const utc = !!(h.utcdate && h.utctime);
  const start = utc
    ? timestamp(h.utcdate, h.utctime, "UTC")
    : timestamp(
        h.startdate ?? h.date ?? h.utcdate,
        h.starttime ?? h.utctime,
        zone,
      );
  const explicitEndDate = h.endutcdate ?? h.enddate;
  const endZone = h.endutctime ? "UTC" : zone;
  let end = timestamp(
    explicitEndDate ?? (utc ? h.utcdate : (h.startdate ?? h.date ?? h.utcdate)),
    h.endutctime ?? h.endtime,
    endZone,
  );
  // An absent EndDate may cross midnight once; an explicit negative interval is corrupt.
  if (start !== null && end !== null && end < start && !explicitEndDate)
    end += 86_400_000;
  return start !== null && end !== null
    ? { start, end, seconds: (end - start) / 1000 }
    : null;
}
function maxDuration(game: NormalizedGame): number {
  // Generous hard limits catch broken timestamps without treating nominal time as played time.
  return game.timeClass === "bullet"
    ? 20 * 60
    : game.timeClass === "blitz"
      ? 2 * 3600
      : 8 * 3600;
}
function validDuration(seconds: number, game: NormalizedGame) {
  return (
    Number.isFinite(seconds) && seconds > 0 && seconds <= maxDuration(game)
  );
}
function emtSeconds(comment: string): number | null {
  const match = comment.match(/\[%emt\s+((?:\d+:){0,2}\d+(?:\.\d+)?)\s*\]/i);
  if (!match) return null;
  const parts = match[1].split(":").map(Number);
  if (
    parts.some((n) => !Number.isFinite(n) || n < 0) ||
    parts.slice(1).some((n) => n >= 60)
  )
    return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}
function elapsedAnnotations(pgn: string): number | null {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history({ verbose: true });
    if (!moves.length) return null;
    const comments = new Map(
      chess.getComments().map((c) => [c.fen, c.comment]),
    );
    const values = moves.map((m) => emtSeconds(comments.get(m.after) ?? ""));
    // Unlike clock differences, missing EMTs cannot recover elapsed time: require every ply.
    return values.every((v) => v !== null)
      ? values.reduce<number>((sum, v) => sum + v!, 0)
      : null;
  } catch {
    return null;
  }
}
export function parseGameDuration(game: NormalizedGame): GameDurationRecord {
  const unavailable = (reason: string): GameDurationRecord => ({
    id: game.id,
    username: game.username,
    durationSeconds: null,
    startTimestamp: null,
    endTimestamp: null,
    source: "unavailable",
    confidence: "derived",
    parserVersion: PLAY_TIME_PARSER_VERSION,
    fingerprint: durationFingerprint(game),
    reason,
  });
  if (!eligibleForPlayTime(game))
    return unavailable(
      game.timeClass === "daily" ? "daily_excluded" : "unsupported_game_type",
    );
  if (!game.pgn || !completedPgn(game.pgn))
    return unavailable("missing_or_unfinished_pgn");
  const base = unavailable("no_reliable_duration"),
    interval = headerInterval(game.pgn),
    clocks = parsePgnClockData(game.pgn, game.timeControl),
    known = clocks.moves.filter((m) => m.thinkSeconds !== null),
    clockCoverage = clocks.moves.length
      ? known.length / clocks.moves.length
      : 0,
    control = timeControl(game.timeControl);
  // Final clocks recover an occasional missing internal annotation without
  // assigning unknown time to zero. Both players' final moves must be observed.
  const finalClocks = (["white", "black"] as const).map((color) => {
    const moves = clocks.moves.filter((m) => m.color === color),
      last = moves.at(-1);
    return control &&
      last?.remainingSeconds !== null &&
      last?.remainingSeconds !== undefined
      ? control.baseSeconds +
          moves.length * control.incrementSeconds -
          last.remainingSeconds
      : null;
  });
  const clockSeconds = finalClocks.every(
    (seconds) => seconds !== null && seconds >= -0.5,
  )
    ? finalClocks.reduce<number>(
        (sum, seconds) => sum + Math.max(0, seconds!),
        0,
      )
    : 0;
  const reliableClocks =
    clockCoverage >= MIN_DURATION_CLOCK_COVERAGE &&
    validDuration(clockSeconds, game);
  if (interval && validDuration(interval.seconds, game)) {
    // Clock time omits terminal waiting after the last ply. Permit that real gap,
    // but do not accept a header shorter than recorded moves or several times longer.
    const tolerance = Math.max(15, (clocks.moves.length + 1) * 0.6);
    const excessiveGap = Math.max(
      120,
      control?.baseSeconds ?? 0,
      clockSeconds * 2,
    );
    if (
      reliableClocks &&
      (interval.seconds + tolerance < clockSeconds ||
        interval.seconds - clockSeconds > excessiveGap)
    ) {
      if (import.meta.env.DEV)
        console.debug(
          "[Chess Insights] Duration source mismatch",
          game.id,
          interval.seconds,
          clockSeconds,
        );
      return {
        ...base,
        clockCoverage,
        reason: "inconsistent_duration_sources",
        diagnostic: `Header ${interval.seconds}s; clocks ${clockSeconds}s`,
      };
    }
    return {
      ...base,
      durationSeconds: interval.seconds,
      startTimestamp: interval.start,
      endTimestamp: interval.end,
      source: "pgn_start_end",
      confidence: "exact",
      reason: undefined,
      clockCoverage,
    };
  }
  if (reliableClocks)
    return {
      ...base,
      durationSeconds: clockSeconds,
      source: "clock_reconstruction",
      reason: undefined,
      clockCoverage,
    };
  const elapsed = elapsedAnnotations(game.pgn);
  if (elapsed !== null && validDuration(elapsed, game))
    return {
      ...base,
      durationSeconds: elapsed,
      source: "emt",
      reason: undefined,
      clockCoverage,
    };
  return {
    ...base,
    clockCoverage,
    reason: interval
      ? "invalid_header_duration"
      : clocks.moves.length && clockCoverage < MIN_DURATION_CLOCK_COVERAGE
        ? "insufficient_clock_coverage"
        : base.reason,
  };
}
