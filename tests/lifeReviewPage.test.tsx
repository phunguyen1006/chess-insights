// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisState, EngineAnalysis } from "../src/analysis/types";
import type { NormalizedGame, Request } from "../src/shared/types";
import type { DataState } from "../src/features/state/useData";
import { InsightsApp } from "../src/features/insights/InsightsApp";
import { LifeReviewPage } from "../src/features/insights/pages/LifeReviewPage";
import { Trend } from "../src/features/insights/components/Charts";
import { downloadText } from "../src/shared/download";

const local = vi.hoisted(() => ({
  theme: "light" as "light" | "dark",
  saved: {
    clocks: [],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  } as AnalysisState,
  send: vi.fn(),
  duration: vi.fn(),
}));
vi.mock("../src/features/state/client", () => ({ send: local.send }));
vi.mock("../src/shared/download", () => ({ downloadText: vi.fn() }));
vi.mock("../src/features/state/useAppearance", () => ({
  useAppearance: () => ({
    theme: local.theme,
    ready: true,
    saving: false,
    error: "",
    change: vi.fn(),
  }),
}));
vi.mock("../src/features/state/usePuzzleData", () => ({
  usePuzzleData: () => ({
    data: { attempts: [], tracking: null },
    enabled: false,
    error: "",
    reload: vi.fn(),
    toggle: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("../src/features/state/usePlayTime", () => ({
  usePlayTime: (username: string, revision: number, enabled: boolean) => {
    local.duration(username, revision, enabled);
    return { records: [], loading: false, processed: 0, total: 0, error: "" };
  },
  playTimeDebug: {
    username: "",
    coverage: null,
    sessions: null,
    progress: null,
  },
}));

function game(
  id: string,
  date: string,
  patch: Partial<NormalizedGame> = {},
): NormalizedGame {
  return {
    id,
    username: "alice",
    url: `https://www.chess.com/game/live/${id}`,
    endTime: new Date(`${date}T12:00:00`).getTime() / 1000,
    localDate: date,
    timeClass: "rapid",
    timeControl: "600",
    rated: true,
    rules: "chess",
    playerColor: "white",
    result: "win",
    rawPlayerResult: "win",
    rawOpponentResult: "resigned",
    termination: "Resignation",
    playerRating: 1500,
    opponentRating: 1520,
    opponentUsername: "bob",
    whiteUsername: "alice",
    blackUsername: "bob",
    whiteRating: 1500,
    blackRating: 1520,
    eco: "D02",
    openingName: "London System",
    variation: null,
    pgn: null,
    ...patch,
  };
}
const games = [
  game("prior-win", "2026-09-01", { playerRating: 1480 }),
  game("prior-loss", "2026-09-02", { result: "loss", playerRating: 1490 }),
  game("current-white-1", "2026-10-01"),
  game("current-black", "2026-10-02", {
    result: "loss",
    timeClass: "blitz",
    timeControl: "180",
    playerColor: "black",
    eco: "B20",
    openingName: "Sicilian Defense",
  }),
  game("current-white-2", "2026-10-03", { playerRating: 1505 }),
];
let container: HTMLDivElement, root: Root;
let loadYears = vi.fn<(years: number[], force?: boolean) => Promise<void>>();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-04T20:00:00"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  local.theme = "light";
  local.saved = {
    clocks: [],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  };
  local.send.mockReset().mockImplementation(async (message: Request) => {
    if (message.type === "ci:analysis" && message.action === "state")
      return local.saved;
    throw new Error(`Unexpected request: ${message.type}`);
  });
  local.duration.mockClear();
  vi.mocked(downloadText).mockReset();
  loadYears = vi
    .fn<(years: number[], force?: boolean) => Promise<void>>()
    .mockResolvedValue(undefined);
  container = document.createElement("div");
  container.className = "ci-scope";
  document.body.append(container);
  root = createRoot(container);
  history.replaceState(
    null,
    "",
    "/home#chess-insights/life-review?review=month",
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function renderPage(
  extra: Partial<Parameters<typeof LifeReviewPage>[0]> = {},
) {
  await act(async () =>
    root.render(
      <LifeReviewPage
        username="alice"
        allGames={games}
        years={[2025, 2026]}
        version={7}
        onLoadYears={loadYears}
        {...extra}
      />,
    ),
  );
}
async function change(select: HTMLSelectElement, value: string) {
  await act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function navigate(hash: string) {
  await act(() => {
    history.replaceState(null, "", `/home#${hash}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}
const select = (label: string) =>
  container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
const analysisRequests = () =>
  local.send.mock.calls
    .map(([request]) => request as Request)
    .filter((request) => request.type === "ci:analysis");

describe("Life Review route and range integration", () => {
  it("opens the native deep link, labels its navigation, and requests durations without starting Stockfish", async () => {
    local.theme = "dark";
    const state: DataState = {
      data: { games, years: [2025, 2026], version: 7, lastSync: 1 },
      username: "alice",
      settingsLoaded: true,
      loading: false,
      error: "",
      refresh: loadYears,
      connect: vi.fn(),
    };
    await act(async () =>
      root.render(<InsightsApp state={state} detected="alice" />),
    );
    const active = container.querySelector(
      '.ci-navigation a[aria-current="page"]',
    );
    expect(active?.textContent).toBe("Life Review");
    expect(active?.getAttribute("href")).toBe("#chess-insights/life-review");
    expect(container.querySelector('[data-ci-theme="dark"]')).not.toBeNull();
    expect(select("Review period").value).toBe("month");
    expect(
      container.querySelector('select[aria-label="Time control"]'),
    ).toBeNull();
    expect(local.duration).toHaveBeenCalledWith("alice", 7, true);
    expect(analysisRequests()).toEqual([
      {
        type: "ci:analysis",
        username: "alice",
        action: "state",
        includeClocks: false,
        includeSelection: false,
      },
    ]);
    const nav = container.querySelector<HTMLAnchorElement>(
      '.ci-navigation a[href="#chess-insights/overview"]',
    )!;
    await act(() => nav.click());
    await act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));
    expect(
      container.querySelector('.ci-navigation a[aria-current="page"]')
        ?.textContent,
    ).toBe("Overview");
    await navigate("chess-insights/life-review?review=lastMonth&pool=blitz");
    expect(select("Review period").value).toBe("lastMonth");
    expect(select("Rating pool").value).toBe("blitz");
  });

  it("offers all nine ranges and clearly separates games percent changes from win-rate percentage points", async () => {
    await renderPage();
    expect(
      [...select("Review period").options].map((option) => option.text),
    ).toEqual([
      "This Week",
      "This Month",
      "Last Month",
      "Last 30 Days",
      "This Quarter",
      "This Year",
      "Last Year",
      "All Time",
      "Custom Range",
    ]);
    expect(loadYears).toHaveBeenCalledWith([2026]);
    const comparison = container.querySelector("#ci-life-compare")!;
    const rows = [...comparison.querySelectorAll("tbody tr")];
    const metrics = new Map(
      rows.map((row) => [
        row.querySelector("th")!.textContent,
        [...row.querySelectorAll("td")].map((cell) => cell.textContent),
      ]),
    );
    expect(metrics.get("Games")).toEqual(["2", "3", "+1 · +50%"]);
    expect(metrics.get("Win rate")).toEqual([
      "50.0%",
      "66.7%",
      "+16.7 percentage points",
    ]);
    expect(comparison.textContent).toContain("Previous month · matched days");
    expect(comparison.textContent).toContain(
      "through the same local time today",
    );
    expect(comparison.textContent).toContain(
      "Current 3 games; previous 2 games.",
    );
  });

  it("updates newly loaded archive games without remounting Life Review or repeatedly requesting the same years", async () => {
    const state: DataState = {
      data: { games, years: [2025, 2026], version: 1, lastSync: 1 },
      username: "alice",
      settingsLoaded: true,
      loading: false,
      error: "",
      refresh: loadYears,
      connect: vi.fn(),
    };
    await act(async () =>
      root.render(<InsightsApp state={state} detected="alice" />),
    );
    await change(select("Rating pool"), "blitz");
    expect(loadYears).toHaveBeenCalledTimes(1);
    const updated = {
      ...state,
      data: {
        ...state.data,
        games: [...games, game("new-archive-game", "2026-10-03")],
        version: 2,
        lastSync: 2,
      },
    };
    await act(async () =>
      root.render(<InsightsApp state={updated} detected="alice" />),
    );
    expect(container.querySelector("#ci-life-compare")?.textContent).toContain(
      "Current 4 games; previous 2 games.",
    );
    expect(select("Rating pool").value).toBe("blitz");
    expect(loadYears).toHaveBeenCalledTimes(1);
    expect(analysisRequests()).toHaveLength(1);
  });

  it("persists the selected pool in the hash and restores it on remount and range changes", async () => {
    await renderPage();
    expect(select("Rating pool").value).toBe("rapid");
    await change(select("Rating pool"), "blitz");
    expect(new URLSearchParams(location.hash.split("?")[1]).get("pool")).toBe(
      "blitz",
    );
    await change(select("Review period"), "lastMonth");
    expect(select("Rating pool").value).toBe("blitz");
    expect(new URLSearchParams(location.hash.split("?")[1]).get("review")).toBe(
      "lastMonth",
    );
    await act(() => root.unmount());
    root = createRoot(container);
    await renderPage();
    expect(select("Rating pool").value).toBe("blitz");
    expect(select("Review period").value).toBe("lastMonth");
  });

  it("advances the calendar cutoff after an unchanged-history refresh without resetting the pool or repeating year loads", async () => {
    vi.setSystemTime(new Date("2026-10-31T23:50:00"));
    const allGames = [...games, game("november-game", "2026-11-01")];
    await renderPage({ allGames });
    await change(select("Rating pool"), "blitz");
    expect(container.querySelector("#ci-life-compare")?.textContent).toContain(
      "Current 3 games; previous 2 games.",
    );
    vi.setSystemTime(new Date("2026-11-01T13:00:00"));
    await renderPage({ allGames, loadingHistory: true });
    await renderPage({ allGames, loadingHistory: false });
    expect(container.textContent).toContain("2026-11-01 — 2026-11-01");
    expect(container.querySelector("#ci-life-compare")?.textContent).toContain(
      "Current 1 games; previous 1 games.",
    );
    expect(select("Rating pool").value).toBe("blitz");
    expect(loadYears).toHaveBeenCalledTimes(1);
    expect(analysisRequests()).toHaveLength(1);
  });

  it("rejects reversed or impossible custom dates and shows a true empty range without fabricated charts", async () => {
    history.replaceState(
      null,
      "",
      "/home#chess-insights/life-review?review=custom&from=2026-10-03&to=2026-10-01",
    );
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Choose valid dates",
    );
    expect(container.querySelector("#ci-life-rating")).toBeNull();
    expect(loadYears).not.toHaveBeenCalled();
    await navigate(
      "chess-insights/life-review?review=custom&from=2026-02-30&to=2026-03-02",
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Choose valid dates",
    );
    await navigate(
      "chess-insights/life-review?review=custom&from=2026-08-01&to=2026-08-02",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain(
      "No cached completed games in this period.",
    );
    expect(container.querySelector("#ci-life-rating")).toBeNull();
    expect(container.querySelector(".ci-life-share")).toBeNull();
    expect(container.textContent).not.toContain("NaN");
  });

  it("only enables calendar days inside the selected range and exposes real selected-day counts", async () => {
    await renderPage();
    const outside = [
      ...container.querySelectorAll<HTMLElement>(".ci-outside-range"),
    ].find((cell) =>
      cell.getAttribute("aria-label")?.startsWith(
        new Date("2026-09-30T12:00:00").toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      ),
    )!;
    expect(outside.tagName).toBe("SPAN");
    expect(outside.getAttribute("aria-label")).toContain(
      "outside selected review range",
    );
    expect(outside.getAttribute("tabindex")).toBeNull();
    await act(() => outside.click());
    expect(
      container.querySelector("#ci-life-activity")?.textContent,
    ).not.toContain("selected games ·");
    expect(
      container.querySelectorAll(".ci-calendar button.ci-cell"),
    ).toHaveLength(4);
    const cell = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".ci-calendar button.ci-cell",
      ),
    ].find((button) =>
      button.getAttribute("aria-label")?.startsWith(
        new Date("2026-10-01T12:00:00").toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      ),
    )!;
    await act(() => cell.click());
    expect(container.querySelector("#ci-life-activity")?.textContent).toContain(
      "2026-10-01: 1 selected games",
    );
  });
});

describe("Life Review reads existing evidence", () => {
  it("preserves and counts one hundred saved analyses, including zero-mistake games, without queue/selection/clock writes", async () => {
    history.replaceState(
      null,
      "",
      "/home#chess-insights/life-review?review=all",
    );
    const historyGames = Array.from({ length: 100 }, (_, index) =>
      game(`saved-${index}`, "2026-09-01", {
        endTime: new Date("2026-09-01T12:00:00").getTime() / 1000 + index * 60,
      }),
    );
    const analyses: EngineAnalysis[] = historyGames.map((g) => ({
      id: g.id,
      username: "alice",
      analysisVersion: 1,
      engineVersion: "18-lite",
      nodes: 20_000,
      analyzedAt: 1234,
      source: "pgn",
    }));
    local.saved = {
      clocks: [],
      analyses,
      mistakes: [],
      reviews: [],
      queue: {
        id: "alice:queue",
        username: "alice",
        status: "paused",
        ids: ["pending-game"],
        completed: 100,
        total: 101,
      },
    };
    const before = JSON.stringify(local.saved);
    await renderPage({ allGames: historyGames });
    const quality = container.querySelector("#ci-life-quality")!;
    expect(quality.textContent).toContain("100 / 100");
    const values = [...quality.querySelectorAll(".ci-summary-row strong")].map(
      (node) => node.textContent,
    );
    expect(values).toEqual(["100 / 100", "0.00", "0.00", "0.00"]);
    expect(JSON.stringify(local.saved)).toBe(before);
    expect(local.saved.analyses).toBe(analyses);
    expect(local.saved.queue?.ids).toEqual(["pending-game"]);
    expect(analysisRequests()).toHaveLength(1);
    expect(analysisRequests()[0]).toMatchObject({
      action: "state",
      includeClocks: false,
      includeSelection: false,
    });
    expect(quality.textContent).toContain("This tab only reads them");
    expect(quality.textContent).toContain(
      "No substitute accuracy score is generated",
    );
    await navigate("chess-insights/life-review?review=lastMonth");
    expect(analysisRequests()).toHaveLength(1);
    expect(JSON.stringify(local.saved)).toBe(before);
  });

  it("filters opening rows by real color metadata rather than parsing label strings", async () => {
    await renderPage();
    const openingSection = [
      ...container.querySelectorAll<HTMLElement>(".ci-chess-section"),
    ].find(
      (section) =>
        section.querySelector("h3")?.textContent === "Openings in this period",
    )!;
    const buttons = [
      ...openingSection.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Review opening color"] button',
      ),
    ];
    const labels = () =>
      [...openingSection.querySelectorAll("tbody th")].map(
        (node) => node.textContent,
      );
    expect(labels()).toEqual([
      "D02 · London System · white",
      "B20 · Sicilian Defense · black",
    ]);
    await act(() =>
      buttons
        .find((button) => button.textContent === "Black defenses")!
        .click(),
    );
    expect(labels()).toEqual(["B20 · Sicilian Defense · black"]);
    await act(() =>
      buttons
        .find((button) => button.textContent === "White openings")!
        .click(),
    );
    expect(labels()).toEqual(["D02 · London System · white"]);
    expect(analysisRequests()).toHaveLength(1);
  });

  it.each(["light", "dark"] as const)(
    "exports the %s native summary with current real coverage and unavailable optional metrics",
    async (theme) => {
      await renderPage({ theme });
      const exportButton = [
        ...container.querySelectorAll<HTMLButtonElement>("button"),
      ].find((button) => button.textContent === "Export summary card")!;
      await act(() => exportButton.click());
      const [filename, svg, mime] = vi.mocked(downloadText).mock.calls[0];
      expect(filename).toBe("chess-insights-alice-life-review.svg");
      expect(mime).toBe("image/svg+xml;charset=utf-8");
      const document = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(
        document.querySelector("parsererror,script,foreignObject,image,a"),
      ).toBeNull();
      expect(document.querySelector("rect")?.getAttribute("fill")).toBe(
        theme === "dark" ? "#262421" : "#ffffff",
      );
      expect(document.documentElement.textContent).toContain(
        "0/3 real-time games with duration · 0/3 analyzed",
      );
      expect(document.documentElement.textContent).toContain("66.7%");
      expect(document.documentElement.textContent).toContain(
        "Recorded play time—",
      );
      expect(document.documentElement.textContent).not.toContain(
        "accuracy score",
      );
      expect(document.documentElement.textContent).toContain(
        "not guaranteed post-game ratings",
      );
    },
  );
});

it("uses elapsed chronological positions in Trend rather than pretending observations are evenly spaced", async () => {
  await act(() =>
    root.render(
      <Trend
        label="Chronological observations"
        data={[
          { label: "Day 1", value: 1500, position: 0 },
          { label: "Day 2", value: 1510, position: 1 },
          { label: "Day 11", value: 1520, position: 10 },
        ]}
        baselineZero={false}
      />,
    ),
  );
  const points = [...container.querySelectorAll("circle")].map((node) =>
    Number(node.getAttribute("cx")),
  );
  expect(points).toHaveLength(3);
  expect((points[1] - points[0]) / (points[2] - points[0])).toBeCloseTo(0.1);
  expect((points[2] - points[1]) / (points[2] - points[0])).toBeCloseTo(0.9);
  expect(
    [...container.querySelectorAll("svg > text")].map(
      (node) => node.textContent,
    ),
  ).toEqual(["Day 1", "Day 11"]);
  expect(
    container.querySelector('circle[aria-label^="Day 2:"]'),
  ).not.toBeNull();
});
