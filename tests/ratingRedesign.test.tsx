// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { RatingPage } from "../src/features/insights/pages/RatingPage";
import { RatingCards } from "../src/features/insights/components/RatingCards";
import { ResultsPage } from "../src/features/insights/pages/ResultsPage";
import { OpeningsPage } from "../src/features/insights/pages/OpeningsPage";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import type { NormalizedGame } from "../src/shared/types";

let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function game(
  id: string,
  date: string,
  rating: number,
  patch: Partial<NormalizedGame> = {},
): NormalizedGame {
  return {
    ...normalizeGame(
      {
        uuid: id,
        end_time: Date.parse(`${date}T12:00:00Z`) / 1000,
        time_class: "rapid",
        time_control: "600",
        rated: true,
        rules: "chess",
        white: { username: "alice", rating, result: "win" },
        black: { username: id, rating: 1100, result: "resigned" },
      },
      "alice",
    )!,
    localDate: date,
    ...patch,
  };
}
function section(title: string) {
  return [...container.querySelectorAll<HTMLElement>(".ci-chess-section")].find(
    (element) => element.querySelector("h3")?.textContent === title,
  )!;
}
function row(sectionTitle: string, label: string) {
  return [
    ...section(sectionTitle).querySelectorAll<HTMLElement>(".ci-section-row"),
  ].find(
    (element) =>
      element.querySelector(".ci-section-label")?.firstChild?.textContent ===
      label,
  )!;
}
async function clickColor(label: string, button: string) {
  await act(() =>
    [
      ...container.querySelectorAll<HTMLButtonElement>(
        `[aria-label="${label}"] button`,
      ),
    ]
      .find((element) => element.textContent === button)!
      .click(),
  );
}

it("keeps rating highlights, strongest win and opponent averages tied to rated standard games", async () => {
  const before = game("before", "2026-09-30", 1000),
    selected = [
      game("loss", "2026-10-01", 1010, {
        playerColor: "black",
        result: "loss",
        opponentRating: 1900,
      }),
      game("white-win", "2026-10-02", 1005, { opponentRating: 1700 }),
      game("strong-win", "2026-10-02", 1015, {
        playerColor: "black",
        opponentRating: 1800,
        endTime: Date.parse("2026-10-02T13:00:00Z") / 1000,
      }),
      game("latest", "2026-10-03", 1030, { opponentRating: 1500 }),
      game("unrated", "2026-10-03", 5000, {
        rated: false,
        opponentRating: 3000,
      }),
    ];
  await act(() =>
    root.render(
      <RatingPage
        games={selected}
        allGames={[before, ...selected]}
        selectedControl="rapid"
      />,
    ),
  );
  expect(
    row("Highlights", "Highest Rating").querySelector("strong")?.textContent,
  ).toBe("1,030");
  expect(row("Highlights", "Best Win").textContent).toContain("strong-win");
  expect(
    row("Highlights", "Best Win").querySelector("strong")?.textContent,
  ).toBe("1,800");
  expect(
    row("Highlights", "Best Win Streak").querySelector("strong")?.textContent,
  ).toBe("3");
  expect(
    row("Average Opponent Rating", "All Games").querySelector("strong")
      ?.textContent,
  ).toBe("1,725");
  expect(
    row("Average Opponent Rating", "When you win").querySelector("strong")
      ?.textContent,
  ).toBe("1,667");
  expect(
    row("Average Opponent Rating", "When you draw").querySelector("strong")
      ?.textContent,
  ).toBe("—");
  expect(
    container.querySelector('select[aria-label="Rating pool"]'),
  ).toBeNull();

  await clickColor("Rating color", "White");
  expect(
    row("Highlights", "Best Win").querySelector("strong")?.textContent,
  ).toBe("1,700");
  expect(
    row("Average Opponent Rating", "All Games").querySelector("strong")
      ?.textContent,
  ).toBe("1,600");
  expect(
    row("Highlights", "Biggest Observed Rating Gain Day").querySelector(
      "strong",
    )?.textContent,
  ).toBe("↑ 15");
  const observation = [
    ...container.querySelectorAll<SVGElement>(".ci-rating-chart [aria-label]"),
  ].find((element) =>
    element.getAttribute("aria-label")?.includes("latest · win"),
  );
  expect(observation?.getAttribute("aria-label")).toContain(
    "observed change ↑ 15",
  );
  expect(
    container.querySelector(
      '[aria-label="Rating color"] button[aria-pressed="true"]',
    )?.textContent,
  ).toBe("White");
});

it("shows missing opponent rating coverage and never invents empty-pool highlights", async () => {
  const known = game("known", "2026-10-01", 1000, { opponentRating: 1800 }),
    unknown = game("unknown", "2026-10-02", 1005, {
      opponentRating: null,
      result: "draw",
    });
  await act(() =>
    root.render(
      <RatingPage
        games={[known, unknown]}
        allGames={[known, unknown]}
        selectedControl="rapid"
      />,
    ),
  );
  expect(row("Average Opponent Rating", "All Games").textContent).toContain(
    "1 / 2 with rating",
  );
  expect(
    row("Average Opponent Rating", "All Games").querySelector("strong")
      ?.textContent,
  ).toBe("1,800");
  expect(
    row("Average Opponent Rating", "When you draw").querySelector("strong")
      ?.textContent,
  ).toBe("—");
  await act(() =>
    root.render(
      <RatingPage
        games={[known, unknown]}
        allGames={[known, unknown]}
        selectedControl="daily"
      />,
    ),
  );
  expect(container.querySelector(".ci-rating-value strong")?.textContent).toBe(
    "—",
  );
  expect(
    row("Highlights", "Best Win Streak").querySelector("strong")?.textContent,
  ).toBe("—");
  expect(
    row("Highlights", "Biggest Observed Rating Gain Day").querySelector(
      "strong",
    )?.textContent,
  ).toBe("—");
});

it("uses one controlled color value for rating and opening selectors", async () => {
  const white = game("white", "2026-10-01", 1000, {
      eco: "C45",
      openingName: "Scotch Game",
    }),
    black = game("black", "2026-10-02", 1010, {
      playerColor: "black",
      eco: "B01",
      openingName: "Scandinavian Defense",
    }),
    change = vi.fn();
  await act(() =>
    root.render(
      <RatingPage
        games={[black]}
        allGames={[white, black]}
        selectedControl="rapid"
        color="black"
        onColorChange={change}
      />,
    ),
  );
  expect(
    container.querySelector(
      '[aria-label="Rating color"] button[aria-pressed="true"]',
    )?.textContent,
  ).toBe("Black");
  await clickColor("Rating color", "White");
  expect(change).toHaveBeenLastCalledWith("white");
  await act(() =>
    root.render(
      <RatingPage
        games={[white]}
        allGames={[white, black]}
        selectedControl="rapid"
        color="white"
        onColorChange={change}
      />,
    ),
  );
  expect(container.querySelector(".ci-rating-value strong")?.textContent).toBe(
    "1,000",
  );
  expect(
    container.querySelector(
      '[aria-label="Rating color"] button[aria-pressed="true"]',
    )?.textContent,
  ).toBe("White");

  await act(() =>
    root.render(
      <OpeningsPage games={[white]} color="white" onColorChange={change} />,
    ),
  );
  expect(
    container.querySelector(
      '[aria-label="Opening color"] button[aria-pressed="true"]',
    )?.textContent,
  ).toBe("White");
  await clickColor("Opening color", "Black");
  expect(change).toHaveBeenLastCalledWith("black");
  await act(() =>
    root.render(
      <OpeningsPage games={[black]} color="black" onColorChange={change} />,
    ),
  );
  expect(
    container.querySelector(".ci-opening-table tbody")?.textContent,
  ).toContain("Scandinavian Defense");
  expect(
    container.querySelector(".ci-opening-table tbody")?.textContent,
  ).not.toContain("Scotch Game");
  expect(
    container.querySelector(
      '[aria-label="Opening color"] button[aria-pressed="true"]',
    )?.textContent,
  ).toBe("Black");
});

it("preserves rolling series and all four truthful profile rating cards", async () => {
  const games = Array.from({ length: 10 }, (_, index) =>
    game(
      String(index),
      `2026-10-${String(index + 1).padStart(2, "0")}`,
      1100 - index * 5,
    ),
  );
  await act(() => root.render(<RatingPage games={games} allGames={games} />));
  const series = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Chart series"]',
  )!;
  await act(() => {
    series.value = "10";
    series.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelector(".ci-rating-chart")?.textContent).toContain(
    "10-game rolling average",
  );
  expect(
    container.querySelector('svg[aria-label="Rating drawdown"]'),
  ).not.toBeNull();
  await act(() => root.render(<RatingCards games={games} />));
  expect(container.querySelectorAll(".ci-rating-card")).toHaveLength(4);
  expect(
    container.querySelector(".ci-rating-card .ci-rating-card-change")
      ?.className,
  ).toContain("ci-negative");
  expect(
    container.querySelector(".ci-rating-card .ci-rating-card-change")
      ?.textContent,
  ).toBe("↓ 45");
  expect(
    container.querySelectorAll(".ci-rating-card strong")[1]?.textContent,
  ).toBe("—");
});

it("renders semantic outcome totals and reason shares without donuts", async () => {
  const games = [
    game("mate", "2026-10-01", 1000, { termination: "Checkmate" }),
    game("resign", "2026-10-02", 1005, { termination: "Resignation" }),
    game("timeout", "2026-10-03", 1000, {
      result: "loss",
      termination: "Timeout",
    }),
    game("draw", "2026-10-04", 990, {
      result: "draw",
      termination: "Repetition",
    }),
  ];
  await act(() => root.render(<ResultsPage games={games} />));
  expect(
    [
      ...container.querySelectorAll(".ci-results-hero .ci-summary-row strong"),
    ].map((element) => element.textContent),
  ).toEqual(["4", "2", "1", "1"]);
  expect(container.querySelector(".ci-donut")).toBeNull();
  expect(
    container.querySelector('[aria-label="How you win"]')?.textContent,
  ).toContain("50.0% of 2 wins");
  expect(
    container.querySelector('[aria-label="How you lose"]')?.textContent,
  ).toContain("100.0% of 1 losses");
  expect(section("Results by time control").textContent).toContain("4 games");
  expect(
    container.querySelector(
      'svg[aria-label="Timeout losses as a percentage of all games"]',
    ),
  ).toBeNull();
  expect(container.textContent).toContain("Months with fewer than five games");
});

it("keeps separate opening colors and sample thresholds while putting the repertoire first", async () => {
  const games = [
    ...Array.from({ length: 12 }, (_, index) =>
      game(`white-${index}`, "2026-10-01", 1000, {
        eco: "C45",
        openingName: "Scotch Game",
        result: index < 9 ? "win" : "loss",
      }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      game(`black-${index}`, "2026-10-02", 1000, {
        eco: "C45",
        openingName: "Scotch Game",
        playerColor: "black",
        result: index < 4 ? "win" : "loss",
      }),
    ),
    ...Array.from({ length: 2 }, (_, index) =>
      game(`rare-${index}`, "2026-10-03", 1000, {
        eco: "B01",
        openingName: "Scandinavian Defense",
      }),
    ),
  ];
  await act(() => root.render(<OpeningsPage games={games} />));
  expect(container.querySelector(".ci-chess-section h3")?.textContent).toBe(
    "Opening repertoire",
  );
  expect(container.querySelectorAll(".ci-opening-table tbody tr")).toHaveLength(
    3,
  );
  const ranking = container.querySelector<HTMLSelectElement>(
    'select[aria-label="Opening ranking"]',
  )!;
  await act(() => {
    ranking.value = "best";
    ranking.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(container.querySelectorAll(".ci-opening-table tbody tr")).toHaveLength(
    2,
  );
  expect(
    container.querySelector(".ci-opening-table tbody tr")?.textContent,
  ).toContain("75.0%");
  await clickColor("Opening color", "Black");
  expect(container.querySelectorAll(".ci-opening-table tbody tr")).toHaveLength(
    1,
  );
  expect(
    container.querySelector(".ci-opening-table tbody")?.textContent,
  ).toContain("40.0%");
  expect(section("Opening results").textContent).toContain("black");
  expect(
    container.querySelector(
      'svg[aria-label="Opening sample size versus win rate"]',
    ),
  ).not.toBeNull();
});
