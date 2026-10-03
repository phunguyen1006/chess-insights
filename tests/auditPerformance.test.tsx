// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { activity } from "../src/analytics/activity";
import { visualSummary } from "../src/analytics/visuals";
import { playTimeSummary, sessionAnalytics } from "../src/analytics/playTime";
import { parseGameDuration } from "../src/analysis/playTime";
import { puzzleActivity } from "../src/analytics/puzzles";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import { localDate } from "../src/shared/dates";
import type { RawGame, PuzzleAttempt } from "../src/shared/types";

it("measures 1k/5k/10k games and 50k activities through actual aggregation and rendering", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  try {
    const raw = JSON.parse(
      readFileSync("audit/fixtures/golden-user.json", "utf8"),
    ).games[0] as RawGame;
    const samples = [];
    const timed = <T,>(run: () => T) => {
      const start = performance.now(),
        value = run();
      return { value, ms: performance.now() - start };
    };
    for (const n of [1000, 5000, 10000]) {
      const base = Date.parse("2026-10-02T12:00:00Z") / 1000;
      const parsed = timed(() =>
        Array.from({ length: n }, (_, i) =>
          normalizeGame(
            { ...raw, uuid: `stress-${i}`, end_time: base - i * 86400 },
            "auditplayer",
          )!,
        ),
      );
      const games = parsed.value,
        records = timed(() => games.map(parseGameDuration));
      const aggregate = timed(() => ({
        activity: activity(games),
        visuals: visualSummary(games),
        time: playTimeSummary(games, records.value),
        sessions: sessionAnalytics(games, records.value),
      }));
      expect(aggregate.value.activity.games).toBe(n);
      expect(aggregate.value.time.totalRecordedSeconds).toBe(n * 10);
      const render = timed(() =>
        renderToStaticMarkup(
          <ActivityHeatmap games={games} year={2026} onDate={() => {}} />,
        ),
      );
      expect(render.value.match(/<button/g)?.length).toBe(365);
      const heap = process.memoryUsage().heapUsed;
      samples.push({
        games: n,
        normalizeMs: parsed.ms,
        durationParseMs: records.ms,
        aggregateMs: aggregate.ms,
        heatmapServerRenderMs: render.ms,
        heapUsedBytes: heap,
      });
    }
    const attempts = Array.from({ length: 50000 }, (_, i): PuzzleAttempt => {
      const at =
        Date.parse("2026-10-02T12:00:00Z") - Math.floor(i / 5) * 86400000;
      return {
        id: `auditplayer:stress-${i}`,
        username: "auditplayer",
        puzzleId: null,
        attemptedAt: at,
        localDate: localDate(new Date(at)),
        result: i % 3 ? "solved" : "failed",
        ratingBefore: null,
        ratingAfter: null,
        ratingChange: null,
        puzzleRating: null,
        source: "live_tracker",
        createdAt: at,
      };
    });
    const p = timed(() => puzzleActivity(attempts));
    expect(p.value.attempts).toBe(50000);
    const render = timed(() =>
      renderToStaticMarkup(
        <ActivityHeatmap
          games={[]}
          attempts={attempts}
          mode="puzzles"
          year={2026}
          onDate={() => {}}
        />,
      ),
    );
    writeFileSync(
      "audit/reports/performance.json",
      JSON.stringify(
        {
          samples,
          puzzles: {
            attempts: 50000,
            activeDays: p.value.activeDays,
            aggregateMs: p.ms,
            heatmapServerRenderMs: render.ms,
          },
          scope:
            "Single run, Node/jsdom server render. Heap values are process snapshots, not a browser leak measurement; no layout or browser long-task claim.",
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    vi.useRealTimers();
  }
}, 120_000);
