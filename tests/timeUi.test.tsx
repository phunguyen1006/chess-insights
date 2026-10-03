// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimePage } from "../src/features/insights/pages/TimePage";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import {
  durationFingerprint,
  type GameDurationRecord,
} from "../src/analysis/playTime";
import type { AnalysisState } from "../src/analysis/types";
import type { NormalizedGame } from "../src/shared/types";

const analysis = vi.hoisted(() => ({
  state: {
    clocks: [],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  } as AnalysisState,
  error: "",
  progress: 100,
  request: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/features/state/useAnalysis", () => ({
  useAnalysis: () => analysis,
  analysisDebug: {},
}));

function game(
  id: string,
  pool: NormalizedGame["timeClass"],
  end: number,
  rating = 1000,
) {
  return normalizeGame(
    {
      uuid: id,
      url: "https://www.chess.com/game/live/" + id,
      end_time: end,
      time_class: pool,
      time_control: pool === "bullet" ? "60" : "600",
      rated: true,
      rules: "chess",
      white: { username: "alice", rating, result: "win" },
      black: { username: "bob", rating: 1100, result: "resigned" },
    },
    "alice",
  )!;
}
const start = Date.UTC(2026, 9, 2, 10) / 1000,
  games = [
    game("one", "rapid", start + 600),
    game("two", "rapid", start + 1020, 1010),
    game("three", "bullet", start + 2000),
    game("unknown", "blitz", start + 4000),
    game("daily", "daily", start + 5000),
  ],
  records: GameDurationRecord[] = games.slice(0, 4).map((g, index) => ({
    id: g.id,
    username: g.username,
    parserVersion: 1,
    fingerprint: durationFingerprint(g),
    durationSeconds: index === 3 ? null : [600, 300, 30][index],
    startTimestamp: index < 2 ? (g.endTime - [600, 300][index]) * 1000 : null,
    endTimestamp: index < 2 ? g.endTime * 1000 : null,
    source:
      index < 2
        ? "pgn_start_end"
        : index === 2
          ? "clock_reconstruction"
          : "unavailable",
    confidence: index < 2 ? "exact" : "derived",
  }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  history.replaceState(null, "", "/home#chess-insights/time");
  analysis.state = {
    clocks: [
      {
        id: games[0].id,
        username: "alice",
        parserVersion: 1,
        source: "pgn",
        supported: true,
        baseSeconds: 600,
        incrementSeconds: 0,
        moves: [
          {
            ply: 1,
            moveNumber: 1,
            color: "white",
            san: "e4",
            remainingSeconds: 598,
            thinkSeconds: 2,
            phase: "opening",
          },
          {
            ply: 39,
            moveNumber: 20,
            color: "white",
            san: "Qh5",
            remainingSeconds: 10,
            thinkSeconds: 30,
            phase: "middlegame",
          },
        ],
      },
    ],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  };
  analysis.error = "";
  analysis.progress = 100;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
const navButton = (label: string) =>
  [
    ...container.querySelectorAll<HTMLButtonElement>(
      'nav[aria-label="Time statistics"] button',
    ),
  ].find((button) => button.textContent === label)!;
const headingTexts = () =>
  [...container.querySelectorAll("h3")].map((heading) => heading.textContent);
async function render(extra: Partial<Parameters<typeof TimePage>[0]> = {}) {
  await act(() =>
    root.render(
      <TimePage
        username="alice"
        games={games}
        durationRecords={records}
        onTimeout={vi.fn()}
        {...extra}
      />,
    ),
  );
}

it("shows recorded play time with separate duration and clock coverage, excluding Daily", async () => {
  await render();
  expect(container.querySelector(".ci-primary-stat strong")?.textContent).toBe(
    "15m 30s",
  );
  expect(container.querySelector(".ci-primary-stat span")?.textContent).toBe(
    "Recorded Play Time",
  );
  const coverage = container.querySelector(
    '[data-scope="duration-coverage"]',
  )?.textContent;
  expect(coverage).toContain("3 / 4 eligible real-time games");
  expect(coverage).toContain("75.0% duration coverage");
  expect(coverage).toContain(
    "Daily games excluded from Play Time (1 selected)",
  );
  expect(container.textContent).toContain("5m 10s");
  expect(headingTexts()).toEqual([
    "Play Time · Last 12 Months",
    "Play Time Highlights",
  ]);
});
it("opens Play Time from a deep link, filters duration distribution, and keeps longest-game links", async () => {
  history.replaceState(
    null,
    "",
    "/home#chess-insights/time?date=2026-10-02&timeView=play-time",
  );
  await render();
  expect(navButton("Play Time").getAttribute("aria-current")).toBe("page");
  expect(headingTexts()).toContain("Game Duration Distribution");
  expect(headingTexts()).toContain("Longest Games");
  const controls = [...container.querySelectorAll("section")].find(
    (element) => element.querySelector("h3")?.textContent === "Time by Control",
  )!;
  expect(
    [...controls.querySelectorAll(".ci-bar-row strong")].map(
      (value) => value.textContent,
    ),
  ).toEqual(["15m 00s", "30s"]);
  const section = [...container.querySelectorAll("section")].find(
    (element) =>
      element.querySelector("h3")?.textContent === "Game Duration Distribution",
  )!;
  const bullet = [
    ...section.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Bullet")!;
  await act(() => bullet.click());
  expect(
    [...section.querySelectorAll(".ci-bar-row strong")].map(
      (value) => value.textContent,
    ),
  ).toEqual(["1", "0", "0", "0", "0", "0"]);
  const longest = [...container.querySelectorAll("section")].find(
    (element) => element.querySelector("h3")?.textContent === "Longest Games",
  )!;
  expect(longest.querySelectorAll('a[target="_blank"]').length).toBe(3);
  await act(() => navButton("Sessions").click());
  expect(location.hash).toContain("date=2026-10-02");
  expect(location.hash).toContain("timeView=sessions");
});
it("retains clock distributions, curves, pool comparisons, and historical move timing", async () => {
  await render();
  await act(() => navButton("Clock Usage").click());
  expect(headingTexts()).toContain("Move-time distribution");
  expect(headingTexts()).toContain("Thinking time by phase");
  expect(headingTexts()).toContain("Clock remaining by move");
  expect(headingTexts()).toContain("Average think time by move number");
  expect(headingTexts()).toContain("Rapid vs Blitz vs Bullet");
  expect(headingTexts()).toContain("Historical game timing");
  expect(
    container.querySelector('select[aria-label="Completed game"]'),
  ).not.toBeNull();
  expect(container.querySelector(".ci-move-table")?.textContent).toContain(
    "Qh5",
  );
  expect(container.textContent).not.toContain("Time Pressure Entry");
});
it("places pressure statistics and timeout navigation in their own view", async () => {
  const timeout = vi.fn();
  await render({ onTimeout: timeout });
  await act(() => navButton("Time Pressure").click());
  expect(headingTexts()).toContain("Time Pressure Entry");
  expect(headingTexts()).toContain("Mistakes and Time Pressure");
  expect(headingTexts()).not.toContain("Move-time distribution");
  const action = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "0 → Results")!;
  await act(() => action.click());
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(container.querySelector(".ci-primary-stat strong")?.textContent).toBe(
    "1",
  );
});
it("makes session coverage distinct from duration coverage and labels observed results", async () => {
  await render();
  await act(() => navButton("Sessions").click());
  expect(
    container.querySelector('[data-scope="session-coverage"]')?.textContent,
  ).toContain("2 / 4 eligible real-time games · 50.0% session coverage");
  expect(container.querySelector(".ci-primary-stat strong")?.textContent).toBe(
    "1",
  );
  expect(container.textContent).toContain(
    "Clock-only durations cannot establish an interval",
  );
  expect(container.textContent).toContain(
    "do not establish fatigue or causality",
  );
  expect(headingTexts()).toContain("Recent Sessions");
  expect(
    container
      .querySelector(
        'svg[aria-label="Observed win rate by game number in session"] [aria-label]',
      )
      ?.getAttribute("aria-label"),
  ).toContain("100%");
});
it("does not present missing durations as zero or complete total time", async () => {
  await render({ durationRecords: [] });
  expect(container.querySelector(".ci-primary-stat strong")?.textContent).toBe(
    "—",
  );
  expect(container.querySelector(".ci-primary-stat span")?.textContent).toBe(
    "Recorded Play Time",
  );
  expect(
    container.querySelector('[data-scope="duration-coverage"]')?.textContent,
  ).toContain("0 / 4");
  expect(container.textContent).toContain("No observations for this period");
});
it("renders cached duration totals while a lazy calculation is in progress and responds to hash navigation", async () => {
  await render({
    durationLoading: true,
    durationProcessed: 3,
    durationTotal: 10,
  });
  expect(container.textContent).toContain(
    "Calculating play time… 3 / 10 games",
  );
  expect(container.querySelector(".ci-primary-stat strong")?.textContent).toBe(
    "15m 30s",
  );
  await act(() => {
    history.replaceState(
      null,
      "",
      "/home#chess-insights/time?timeView=sessions",
    );
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(navButton("Sessions").getAttribute("aria-current")).toBe("page");
});
