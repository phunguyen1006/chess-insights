import { expect, it } from "vitest";
import fixture from "../src/dev/data/public-games.json";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { parseGameDuration } from "../src/analysis/playTime";
import { playTimeSummary, sessionAnalytics } from "../src/analytics/playTime";

const examples = [
  ["147462360030", 216, 197.4],
  ["147471819418", 95, 80.6],
  ["147472983586", 44, 36.8],
  ["147475611378", 213, 193.5],
  ["147511905624", 89, 83.1],
] as const;
it.each(examples)(
  "matches manual public-PGN header and clock calculations for game%s",
  (id, headerSeconds, clockSeconds) => {
    const raw = fixture.games.find((g) => g.url.endsWith(id))!;
    const game = normalizeGame(raw, fixture.username)!;
    const exact = parseGameDuration(game);
    expect(exact.source).toBe("pgn_start_end");
    expect(exact.durationSeconds).toBe(headerSeconds);
    // Independently calculate from final observed clocks and actual played plies.
    const withoutHeaders = {
      ...game,
      pgn: game.pgn!.replace(
        /^\[(?:StartTime|UTCTime|EndTime|EndDate)\s+.*\]\s*$/gm,
        "",
      ),
    };
    const reconstructed = parseGameDuration(withoutHeaders);
    expect(reconstructed.source).toBe("clock_reconstruction");
    expect(reconstructed.clockCoverage).toBe(1);
    expect(reconstructed.durationSeconds).toBeCloseTo(clockSeconds, 6);
  },
);
it("reports public fixture coverage without treating unavailable games as zero-duration samples", () => {
  const games = fixture.games
    .map((g) => normalizeGame(g, fixture.username))
    .filter((g) => g !== null);
  const durations = games.map(parseGameDuration);
  const summary = playTimeSummary(games, durations),
    sessions = sessionAnalytics(games, durations);
  expect(summary.withDuration + summary.unavailable).toBe(
    summary.eligibleRealtimeGames,
  );
  expect(summary.averageDurationSeconds).toBe(
    summary.totalRecordedSeconds / summary.withDuration,
  );
  expect(summary).toMatchObject({
    selectedGames: 193,
    eligibleRealtimeGames: 72,
    withDuration: 72,
    coverage: 1,
    totalRecordedSeconds: 11573,
    dailyExcluded: 121,
  });
  expect(sessions).toMatchObject({
    totalSessions: 53,
    withIntervals: 72,
    coverage: 1,
  });
});
