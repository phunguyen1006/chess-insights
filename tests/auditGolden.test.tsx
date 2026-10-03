// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectExtension,
  type RawAuditData,
} from "../audit/verifier/collectExtension";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import type { NormalizedGame, PuzzleAttempt } from "../src/shared/types";
import { database } from "../src/data/storage/database";

const originalZone = process.env.TZ;
process.env.TZ ??= "UTC";
const zone = process.env.TZ,
  name = zone.replaceAll("/", "_");
const input = JSON.parse(
  readFileSync(resolve("audit/fixtures/golden-user.json"), "utf8"),
) as RawAuditData;
const expected = JSON.parse(
  readFileSync(resolve(`audit/reports/independent-${name}.json`), "utf8"),
);
let actual: Record<string, unknown>,
  games: NormalizedGame[],
  attempts: PuzzleAttempt[];
beforeAll(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(input.asOf));
  const collected = await collectExtension(input);
  actual = collected.metrics;
  games = collected.games;
  attempts = collected.attempts;
  writeFileSync(
    resolve(`audit/reports/extension-${name}.json`),
    JSON.stringify(actual, null, 2) + "\n",
  );
});
afterAll(async () => {
  (await database()).close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
it("compares actual storage and analytics with the independent raw oracle", () => {
  expect(actual).toEqual(expected);
});
it("preserves count, outcome, pool, duration and calendar invariants", () => {
  expect(games).toHaveLength(30);
  expect(attempts).toHaveLength(12);
  expect(
    Number(actual.wins) + Number(actual.losses) + Number(actual.draws),
  ).toBe(actual.games);
  expect(
    ["rapid", "blitz", "bullet", "daily", "unknown"].reduce(
      (s, p) => s + Number(actual[p]),
      0,
    ),
  ).toBe(actual.games);
  expect(
    ["rapid", "blitz", "bullet"].reduce(
      (s, p) => s + Number(actual[`${p}TimeSeconds`]),
      0,
    ),
  ).toBe(actual.totalTimeSeconds);
  expect(
    Object.values(actual["heatmap.combined"] as Record<string, number>).reduce(
      (s, n) => s + n,
      0,
    ),
  ).toBe(42);
  for (const k of ["winRate", "puzzleSuccessRate"]) {
    expect(Number(actual[k])).toBeGreaterThanOrEqual(0);
    expect(Number(actual[k])).toBeLessThanOrEqual(100);
  }
});
it("renders every calendar count exactly once in games, puzzles and combined modes", async () => {
  const el = document.createElement("div"),
    root = createRoot(el);
  try {
    for (const mode of ["games", "puzzles", "all"] as const) {
      let sum = 0;
      for (const year of [2023, 2024, 2025, 2026]) {
        await act(() =>
          root.render(
            <ActivityHeatmap
              games={games}
              attempts={attempts}
              mode={mode}
              year={year}
              trackingSince="2023-01-01"
              onDate={() => {}}
            />,
          ),
        );
        const cells = [
          ...el.querySelectorAll<HTMLButtonElement>("button.ci-cell"),
        ];
        expect(cells).toHaveLength(year === 2024 ? 366 : 365);
        for (const cell of cells) {
          const label = cell.getAttribute("aria-label")!;
          if (mode !== "puzzles")
            sum += Number(label.match(/(\d+) games/)?.[1] ?? 0);
          if (mode !== "games")
            sum += Number(label.match(/(\d+) puzzle attempts/)?.[1] ?? 0);
          expect(label).not.toMatch(/NaN|undefined|Infinity/);
        }
      }
      expect(sum).toBe(mode === "games" ? 30 : mode === "puzzles" ? 12 : 42);
    }
  } finally {
    await act(() => root.unmount());
  }
});
