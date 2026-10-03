import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { heatmapIntensityScale } from "../src/analytics/activity";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import type { PuzzleAttempt } from "../src/shared/types";

it("preserves literal quantile boundaries and the one-value scale", () => {
  const values = [1, 2, 2, 3, 5, 8, 13, 21];
  expect([0, ...values].map(heatmapIntensityScale(values))).toEqual([
    0, 1, 1, 1, 3, 3, 4, 5, 5,
  ]);
  expect(
    [0, ...values].map(heatmapIntensityScale(values, [0.25, 0.5, 0.75])),
  ).toEqual([0, 1, 1, 1, 2, 3, 3, 4, 4]);
  expect([0, 1, 5].map(heatmapIntensityScale([5, 5]))).toEqual([0, 2, 2]);
  expect([0, 1].map(heatmapIntensityScale([]))).toEqual([0, 1]);
});
it("does not repeat distribution sorting for each of 1000 puzzle days", () => {
  const attempts = Array.from({ length: 1000 }, (_, i): PuzzleAttempt => ({
    id: `auditplayer:${i}`,
    username: "auditplayer",
    puzzleId: null,
    attemptedAt: 1,
    localDate: new Date(Date.UTC(2026, 9, 1) - i * 86400000)
      .toISOString()
      .slice(0, 10),
    result: "solved",
    ratingBefore: null,
    ratingAfter: null,
    ratingChange: null,
    puzzleRating: null,
    source: "live_tracker",
    createdAt: 1,
  }));
  const sort = vi.spyOn(Array.prototype, "sort");
  try {
    renderToStaticMarkup(
      <ActivityHeatmap
        games={[]}
        attempts={attempts}
        year={2026}
        mode="puzzles"
        onDate={() => {}}
      />,
    );
    expect(sort.mock.calls.length).toBeLessThan(20);
  } finally {
    sort.mockRestore();
  }
});
