// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import { InsightsApp } from "../src/features/insights/InsightsApp";
import { ActivityPage } from "../src/features/insights/pages/ActivityPage";
import { RatingPage } from "../src/features/insights/pages/RatingPage";
import { ResultsPage } from "../src/features/insights/pages/ResultsPage";
import { FilterBar } from "../src/features/insights/components/Common";
import { defaultFilters } from "../src/analytics/results";
import type { DataState } from "../src/features/state/useData";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
const g = normalizeGame(
  {
    uuid: "ui",
    end_time: 1790060400,
    time_class: "rapid",
    rated: true,
    rules: "chess",
    white: { username: "alice", result: "win", rating: 1000 },
    black: { username: "bob", result: "resigned", rating: 1100 },
  },
  "alice",
)!;
it("keeps All Activity independent of game filters and hides those filters in Puzzles", async () => {
  history.replaceState(null, "", "/home#chess-insights/activity");
  const state: DataState = {
    data: {
      games: [g, { ...g, id: "black-game", playerColor: "black" }],
      years: [2026],
      lastSync: 1,
      version: 1,
    },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  const button = (label: string) =>
    [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".ci-activity-modes button",
      ),
    ].find((b) => b.textContent === label)!;
  expect(container.querySelector('select[aria-label="Color"]')).toBeNull();
  expect(container.querySelector(".ci-stat-grid strong")?.textContent).toBe(
    "2",
  );
  await act(() => button("Games").click());
  const color = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Color"]',
  )!;
  await act(() => {
    color.value = "black";
    color.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector(".ci-stat-grid strong")?.textContent).toBe(
    "1",
  );
  await act(() => button("All Activity").click());
  expect(container.querySelector(".ci-stat-grid strong")?.textContent).toBe(
    "2",
  );
  expect(container.querySelector('select[aria-label="Color"]')).toBeNull();
  await act(() => button("Puzzles").click());
  expect(container.querySelector('select[aria-label="Metric"]')).toBeNull();
  expect(container.textContent).toContain(
    "Earlier puzzle history is not available",
  );
  expect(
    container.querySelectorAll(".ci-puzzle-unknown").length,
  ).toBeGreaterThan(0);
});
it("asks for confirmation before clearing local puzzle history and lets the user cancel", async () => {
  const state: DataState = {
    data: { games: [g], years: [2026], lastSync: 1, version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === label,
    )!;
  await act(() => button("Settings").click());
  await act(() => button("Clear locally tracked puzzle history").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Game history and game analyses will be preserved",
  );
  await act(() => button("Cancel").click());
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("resets the puzzle-clear confirmation after switching accounts", async () => {
  const state: DataState = {
    data: { games: [g], years: [2026], lastSync: 1, version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  await act(() => root.render(<InsightsApp state={state} detected={null} />));
  const click = async (label: string) =>
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === label)!
        .click(),
    );
  await click("Settings");
  await click("Clear locally tracked puzzle history");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(() =>
    root.render(
      <InsightsApp state={{ ...state, username: "bob" }} detected={null} />,
    ),
  );
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it("clamps month-based periods at the end of shorter months", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-31T12:00:00"));
  const change = vi.fn();
  try {
    await act(() =>
      root.render(
        <FilterBar
          filters={defaultFilters}
          onChange={change}
          onPeriod={vi.fn()}
        />,
      ),
    );
    const period = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Period"]',
    )!;
    await act(() => {
      period.value = "3m";
      period.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(change.mock.lastCall?.[0]).toMatchObject({
      start: "2026-02-28",
      end: "2026-05-31",
    });
  } finally {
    vi.useRealTimers();
  }
});
it("respects the global time control in Activity rating movement and Rating history", async () => {
  const daily = { ...g, timeClass: "daily" as const };
  await act(() =>
    root.render(
      <ActivityPage
        mode="games"
        games={[daily]}
        allGames={[daily]}
        years={[2026]}
        date=""
        onYear={vi.fn()}
        selectedControl="daily"
      />,
    ),
  );
  const metric = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Metric"]',
  )!;
  await act(() => {
    metric.value = "rating";
    metric.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector(".ci-stat strong")?.textContent).toBe("1");
  expect(
    container.querySelector('select[aria-label="Rating pool"]'),
  ).toBeNull();
  await act(() =>
    root.render(
      <RatingPage games={[daily]} allGames={[daily]} selectedControl="daily" />,
    ),
  );
  expect(
    container.querySelector(".ci-rating-chart")?.getAttribute("aria-label"),
  ).toBe("daily rating history");
});
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (message: { type: string }) => ({
        ok: true,
        data:
          message.type === "ci:puzzles"
            ? { attempts: [], tracking: null }
            : message.type === "ci:settings"
              ? { trackPuzzleActivity: true }
              : {
                  clocks: [],
                  analyses: [],
                  mistakes: [],
                  reviews: [],
                  queue: null,
                },
      }),
    },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  history.replaceState(null, "", "/home");
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows a loading state rather than invented zero statistics before archives arrive", async () => {
  const state: DataState = {
    data: { games: [], years: [2026], lastSync: 0, version: 0 },
    username: "alice",
    settingsLoaded: true,
    loading: true,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  location.hash = "chess-insights/overview";
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  expect(container.textContent).toContain("Loading statistics");
  expect(container.querySelector(".ci-kpi-grid")).toBeNull();
  expect(
    [...container.querySelectorAll("a")].some(
      (a) => a.textContent === "Results",
    ),
  ).toBe(true);
});
it("renders Results with real counts and no fabricated outcomes", async () => {
  await act(() => root.render(<ResultsPage games={[g]} />));
  expect(container.querySelector(".ci-donut-total")?.textContent).toBe("1");
  expect(container.textContent).toContain("No games for this breakdown.");
  expect(container.textContent).toContain("No draws in this period.");
  expect(
    container.querySelector('svg[aria-label="How you win"]'),
  ).not.toBeNull();
});
it("renders every day with accessible labels and supports focus tooltips", async () => {
  await act(() =>
    root.render(<ActivityHeatmap games={[g]} year={2026} onDate={vi.fn()} />),
  );
  const cells = container.querySelectorAll<HTMLButtonElement>("button");
  expect(cells).toHaveLength(365);
  await act(() => cells[0].focus());
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
    "January 1, 2026",
  );
  expect(cells[0].getAttribute("aria-describedby")).toBe("ci-calendar-tooltip");
  await act(() => cells[0].blur());
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
});
it("keeps cached statistics and offers Retry on a refresh failure", async () => {
  const state: DataState = {
    data: { games: [g], years: [2026], lastSync: Date.now(), version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "Network unavailable",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  location.hash = "chess-insights/overview";
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  expect(container.textContent).toContain("showing cached data");
  expect(container.textContent).toContain("Total games");
  expect(container.textContent).toContain("Network unavailable");
  expect(
    [...container.querySelectorAll("button")].some(
      (b) => b.textContent === "Retry",
    ),
  ).toBe(true);
});
it("renders honest future placeholders and disables refresh while syncing", async () => {
  const state: DataState = {
    data: { games: [g], years: [2026], lastSync: 0, version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: true,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  location.hash = "chess-insights/mistakes";
  await act(() => root.render(<InsightsApp state={state} detected="alice" />));
  expect(container.textContent).toContain(
    "Review important mistakes from your completed games.",
  );
  expect(
    [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Refresh"),
    )?.disabled,
  ).toBe(true);
});
