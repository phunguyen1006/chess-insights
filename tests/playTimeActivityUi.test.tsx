// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import { PlayTimeActivityPage } from "../src/features/insights/pages/PlayTimeActivityPage";
import { InsightsApp } from "../src/features/insights/InsightsApp";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  durationFingerprint,
  type GameDurationRecord,
} from "../src/analysis/playTime";
import type { NormalizedGame, PuzzleAttempt } from "../src/shared/types";
import type { DataState } from "../src/features/state/useData";

const local = vi.hoisted(() => ({
  records: [] as GameDurationRecord[],
  attempts: [] as PuzzleAttempt[],
  usePlayTime: vi.fn(),
}));
vi.mock("../src/features/state/usePlayTime", () => ({
  usePlayTime: (username: string, version: number, enabled: boolean) => {
    local.usePlayTime(username, version, enabled);
    return {
      records: local.records,
      loading: false,
      processed: local.records.length,
      total: local.records.length,
      error: "",
    };
  },
  playTimeDebug: {
    username: "",
    coverage: null,
    sessions: null,
    progress: null,
  },
}));
vi.mock("../src/features/state/usePuzzleData", () => ({
  usePuzzleData: () => ({
    data: { attempts: local.attempts, tracking: null },
    enabled: true,
    error: "",
    reload: vi.fn(),
    toggle: vi.fn(),
    clear: vi.fn(),
  }),
}));
function game(
  id: string,
  date: string,
  pool: NormalizedGame["timeClass"] = "rapid",
) {
  return {
    ...normalizeGame(
      {
        uuid: id,
        url: "https://www.chess.com/game/live/" + id,
        end_time: Date.parse(date + "T12:00:00Z") / 1000,
        time_class: pool,
        time_control: pool === "bullet" ? "60" : "600",
        rated: true,
        rules: "chess",
        white: { username: "alice", rating: 1000, result: "win" },
        black: { username: "bob", rating: 1100, result: "resigned" },
      },
      "alice",
    )!,
    localDate: date,
  };
}
const games = [
  game("long", "2026-10-01"),
  game("short-one", "2026-10-02", "bullet"),
  game("short-two", "2026-10-02", "bullet"),
  game("missing", "2026-10-03"),
  game("partial-known", "2026-10-04"),
  game("partial-missing", "2026-10-04"),
  game("daily", "2026-10-05", "daily"),
];
const seconds = [600, 60, 60, null, 100, null, 800_000];
const records: GameDurationRecord[] = games.map((g, index) => ({
  id: g.id,
  username: g.username,
  parserVersion: 1,
  fingerprint: durationFingerprint(g),
  durationSeconds: seconds[index],
  startTimestamp:
    seconds[index] === null ? null : g.endTime * 1000 - seconds[index]! * 1000,
  endTimestamp: seconds[index] === null ? null : g.endTime * 1000,
  source: seconds[index] === null ? "unavailable" : "pgn_start_end",
  confidence: "exact",
}));
const puzzle: PuzzleAttempt = {
  id: "alice:attempt",
  username: "alice",
  puzzleId: "123",
  attemptedAt: Date.parse("2026-10-06T12:00:00Z"),
  localDate: "2026-10-06",
  result: "solved",
  ratingBefore: 1200,
  ratingAfter: 1210,
  ratingChange: 10,
  puzzleRating: 1200,
  source: "live_tracker",
  createdAt: Date.parse("2026-10-06T12:00:00Z"),
};
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("chrome", {
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    runtime: {
      sendMessage: async () => ({ ok: true, data: { theme: "light" } }),
    },
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  local.records = records;
  local.attempts = [puzzle];
  local.usePlayTime.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  history.replaceState(
    null,
    "",
    "/home#chess-insights/activity?activity=playTime&date=2026-10-03",
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const cell = (date: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".ci-cell")].find(
    (button) =>
      button.getAttribute("aria-label")?.startsWith(
        new Date(date + "T12:00:00").toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      ),
  )!;
const level = (button: HTMLButtonElement) =>
  Number(button.className.match(/ci-level-(\d+)/)![1]);
async function heatmap(
  extra: Partial<Parameters<typeof ActivityHeatmap>[0]> = {},
) {
  await act(() =>
    root.render(
      <ActivityHeatmap
        games={games}
        year={2026}
        metric="playTime"
        durationRecords={records}
        attempts={[puzzle]}
        onDate={vi.fn()}
        {...extra}
      />,
    ),
  );
}
it("stripes days with no duration and reports coverage without fabricating zero play time", async () => {
  await heatmap();
  const missing = cell("2026-10-03");
  expect(missing.classList.contains("ci-duration-unknown")).toBe(true);
  expect(missing.getAttribute("aria-label")).toContain("Duration unavailable");
  expect(missing.getAttribute("aria-label")).not.toContain("0s");
  await act(() => missing.focus());
  const tooltip = container.querySelector('[role="tooltip"]')!.textContent;
  expect(tooltip).toContain("Duration unavailable");
  expect(tooltip).toContain("0/1 games with duration · 0.0% coverage");
  expect(tooltip).not.toContain("0s recorded play time");
  await act(() => cell("2026-10-04").focus());
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
    "1/2 games with duration · 50.0% coverage",
  );
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
    "1m 40s recorded play time",
  );
});
it("encodes recorded seconds rather than game counts and leaves puzzle-only dates unfilled", async () => {
  await heatmap();
  expect(level(cell("2026-10-01"))).toBeGreaterThan(level(cell("2026-10-02")));
  expect(level(cell("2026-10-06"))).toBe(0);
  await act(() => cell("2026-10-06").focus());
  expect(
    container.querySelector('[role="tooltip"]')?.textContent,
  ).not.toContain("puzzles");
  expect(
    container.querySelector('[role="tooltip"]')?.textContent,
  ).not.toContain("solved");
});
it.each(["all", "puzzles"] as const)(
  "keeps the Play Time metric independent of %s activity mode",
  async (mode) => {
    await heatmap({ mode });
    expect(level(cell("2026-10-06"))).toBe(0);
    expect(level(cell("2026-10-01"))).toBeGreaterThan(
      level(cell("2026-10-02")),
    );
    expect(cell("2026-10-01").classList.contains("ci-puzzle-unknown")).toBe(
      false,
    );
    await act(() => cell("2026-10-06").focus());
    expect(
      container.querySelector('[role="tooltip"]')?.textContent,
    ).not.toContain("puzzles attempted");
    expect(
      container.querySelector('[role="tooltip"]')?.textContent,
    ).not.toContain("Puzzle history");
  },
);
it("excludes Daily games and presents empty real-time duration coverage as unavailable", async () => {
  await act(() =>
    root.render(
      <PlayTimeActivityPage
        games={[games[6]]}
        allGames={games}
        years={[2026]}
        date="2026-10-05"
        onYear={vi.fn()}
        durationRecords={records}
      />,
    ),
  );
  const values = [...container.querySelectorAll(".ci-summary-row")][0];
  expect(
    [...values.querySelectorAll("strong")].map((value) => value.textContent),
  ).toEqual(["—", "0/0", "—", "—"]);
  await act(() => cell("2026-10-05").focus());
  const tooltip = container.querySelector('[role="tooltip"]')!.textContent;
  expect(tooltip).toContain("No recorded real-time games");
  expect(tooltip).toContain("0/0 games with duration · — coverage");
  expect(tooltip).toContain("1 Daily games excluded");
  expect(tooltip).not.toContain("222h");
});
it("retains Play Time mode when selecting a calendar date", async () => {
  await act(() =>
    root.render(
      <PlayTimeActivityPage
        games={games}
        allGames={games}
        years={[2026]}
        date=""
        onYear={vi.fn()}
        durationRecords={records}
      />,
    ),
  );
  await act(() => cell("2026-10-01").click());
  const params = new URLSearchParams(location.hash.split("?")[1]);
  expect(params.get("activity")).toBe("playTime");
  expect(params.get("date")).toBe("2026-10-01");
});
it("opens and reloads the direct Play Time activity route with its selected date", async () => {
  const state: DataState = {
    data: { games, years: [2026], lastSync: 1, version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
  };
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  const selected = () =>
    container.querySelector(
      '[role="group"][aria-label="Activity mode"] button[aria-pressed="true"]',
    )?.textContent;
  expect(selected()).toBe("Play Time");
  expect(local.usePlayTime).toHaveBeenCalledWith("alice", 1, true);
  expect(container.textContent).toContain("2026 play time");
  expect(container.textContent).not.toContain("puzzles attempted");
  await act(() => cell("2026-10-01").click());
  await act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
  expect(selected()).toBe("Play Time");
  expect(container.textContent).toContain("October 1, 2026");
  await act(() => root.unmount());
  root = createRoot(container);
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  expect(selected()).toBe("Play Time");
  expect(container.textContent).toContain("October 1, 2026");
});
