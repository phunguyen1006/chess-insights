// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "../src/shared/download";
import {
  LifeReviewShareCard,
  lifeReviewShareSvg,
  ResultComparison,
  SessionTimeline,
  WeekHourMatrix,
  type LifeReviewShareProps,
  type WeekHourCell,
} from "../src/features/insights/components/LifeReviewVisuals";

vi.mock("../src/shared/download", () => ({ downloadText: vi.fn() }));

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  container.className = "ci-scope";
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(downloadText).mockReset();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const matrixCell = (day: string, hour: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".ci-life-hour-cell")].find(
    (cell) => cell.getAttribute("aria-label")?.startsWith(`${day}, ${hour}`),
  )!;
const cells: WeekHourCell[] = [
  { weekday: 0, hour: 9, games: 4, seconds: null, knownDurations: 0 },
  { weekday: 0, hour: 10, games: 2, seconds: 120, knownDurations: 1 },
  { weekday: 6, hour: 23, games: 1, seconds: 600, knownDurations: 1 },
];

describe("weekday × hour matrix", () => {
  it("distinguishes missing duration from an empty slot and exposes complete keyboard details", async () => {
    await act(() =>
      root.render(<WeekHourMatrix cells={cells} metric="time" />),
    );
    expect(container.querySelectorAll(".ci-life-hour-cell")).toHaveLength(168);
    const unknown = matrixCell("Monday", "09:00");
    expect(unknown.classList.contains("ci-duration-unknown")).toBe(true);
    expect(unknown.getAttribute("aria-label")).toContain(
      "4 games · Duration unavailable",
    );
    expect(unknown.getAttribute("aria-label")).not.toContain("0s");
    const empty = matrixCell("Monday", "08:00");
    expect(empty.classList.contains("ci-duration-unknown")).toBe(false);
    expect(empty.getAttribute("aria-label")).toContain(
      "0 games · No games in this slot",
    );
    const partial = matrixCell("Monday", "10:00");
    await act(() => partial.focus());
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Monday, 10:00–11:00: 2 games · 2m 00s recorded play time · 1/2 games with duration",
    );
    expect(matrixCell("Sunday", "23:00").getAttribute("aria-label")).toContain(
      "23:00–24:00",
    );
    expect(
      container.querySelector('[role="region"]')?.getAttribute("aria-label"),
    ).toContain("Scroll horizontally");
  });

  it("changes its encoding with the metric and refreshes focused details when data changes", async () => {
    await act(() =>
      root.render(<WeekHourMatrix cells={cells} metric="games" />),
    );
    expect(matrixCell("Monday", "09:00").classList.contains("ci-level-4")).toBe(
      true,
    );
    expect(matrixCell("Sunday", "23:00").classList.contains("ci-level-1")).toBe(
      true,
    );
    await act(() => matrixCell("Monday", "10:00").focus());
    const changed = cells.map((cell) =>
      cell.hour === 10
        ? { ...cell, games: 3, seconds: 180, knownDurations: 2 }
        : cell,
    );
    await act(() =>
      root.render(<WeekHourMatrix cells={changed} metric="time" />),
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "3 games · 3m 00s recorded play time · 2/3 games with duration",
    );
    expect(matrixCell("Sunday", "23:00").classList.contains("ci-level-4")).toBe(
      true,
    );
    expect(
      matrixCell("Monday", "09:00").classList.contains("ci-duration-unknown"),
    ).toBe(true);
  });

  it("ignores invalid grid locations rather than losing a row or breaking rendering", async () => {
    await act(() =>
      root.render(
        <WeekHourMatrix
          cells={[
            ...cells,
            {
              weekday: -1,
              hour: 0,
              games: 99,
              seconds: 99,
              knownDurations: 99,
            },
            {
              weekday: 0,
              hour: 24,
              games: 99,
              seconds: 99,
              knownDurations: 99,
            },
          ]}
          metric="games"
        />,
      ),
    );
    expect(container.querySelectorAll(".ci-life-hour-cell")).toHaveLength(168);
    expect(container.innerHTML).not.toContain("99 games");
  });
});

describe("result comparisons", () => {
  it("shows distinct period totals and W/D/L percentages without confusing percentage-point changes", () => {
    const html = renderToStaticMarkup(
      <ResultComparison
        current={{ wins: 4, draws: 1, losses: 3 }}
        previous={{ wins: 2, draws: 2, losses: 4 }}
        currentLabel="October 1–8"
        previousLabel="September 1–8"
      />,
    );
    expect(html).toContain(
      "4 wins (50.0%) · 1 draws (12.5%) · 3 losses (37.5%)",
    );
    expect(html).toContain(
      "2 wins (25.0%) · 2 draws (25.0%) · 4 losses (50.0%)",
    );
    expect(html).toContain("October 1–8: 4 wins, 1 draws, 3 losses");
    expect(html).toContain("September 1–8: 2 wins, 2 draws, 4 losses");
    expect(html).not.toContain("donut");
    expect(html).not.toContain("pp");
  });
  it("renders an empty period as unavailable rates and leaves absent comparison out", () => {
    const html = renderToStaticMarkup(
      <ResultComparison
        current={{ wins: 0, draws: 0, losses: 0 }}
        currentLabel="All time"
      />,
    );
    expect(html).toContain("No completed games in this period.");
    expect(html).toContain("0 wins (—)");
    expect(html).not.toContain("Previous period");
    expect(html).not.toContain("NaN");
  });
});

const shareProps: LifeReviewShareProps = {
  username: "alice",
  period: "This month · October 1–4, 2026",
  headline: "Played more often, with stable observed rapid ratings.",
  games: 24,
  winRate: 50,
  observedChange: 0,
  pool: "rapid",
  timeSeconds: 3600,
  activeDays: 4,
  opening: "Sicilian Defense",
  coverage: "18/24 real-time games with recorded duration.",
};
const parseSvg = (svg: string) =>
  new DOMParser().parseFromString(svg, "image/svg+xml");

describe("native export-ready summary card", () => {
  it("creates a standalone SVG and escapes untrusted text without scripts, links or remote assets", () => {
    const injected = `<script>alert("hello")</script> & 'rook' \u0001`;
    const svg = lifeReviewShareSvg({
      ...shareProps,
      username: injected,
      opening: injected,
    });
    const parsed = parseSvg(svg);
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelector("script, foreignObject, image, a")).toBeNull();
    expect(parsed.querySelectorAll("[href], [onclick]")).toHaveLength(0);
    expect(parsed.documentElement.textContent).toContain(
      `<script>alert("hello")</script> & 'rook'`,
    );
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("\u0001");
    expect(parsed.documentElement.textContent).toContain(
      "18/24 real-time games with recorded duration.",
    );
    expect(parsed.documentElement.textContent).toContain(
      "not guaranteed post-game ratings",
    );
  });
  it("retains unavailable metrics and expands long text without cropping it", () => {
    const headline = `${"Long descriptive sentence. ".repeat(18)}End of summary.`;
    const opening = "A".repeat(200);
    const svg = lifeReviewShareSvg({
      ...shareProps,
      headline,
      opening,
      observedChange: null,
      winRate: null,
      timeSeconds: null,
      theme: "dark",
    });
    const parsed = parseSvg(svg);
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(
      Number(parsed.documentElement.getAttribute("height")),
    ).toBeGreaterThan(600);
    expect(parsed.querySelector("rect")?.getAttribute("fill")).toBe("#262421");
    expect(
      [...parsed.querySelectorAll("text")]
        .map((node) => node.textContent)
        .join(" "),
    ).toContain("End of summary.");
    expect(
      [...parsed.querySelectorAll("text")].filter(
        (node) => node.textContent === "—",
      ),
    ).toHaveLength(3);
    const openingLines = [...parsed.querySelectorAll("text")].filter((node) =>
      /^A+$/.test(node.textContent ?? ""),
    );
    expect(openingLines.map((node) => node.textContent).join("")).toBe(opening);
    expect(openingLines.every((node) => node.textContent!.length <= 75)).toBe(
      true,
    );
  });
  it("downloads an image using the visible theme and current account and exposes retry errors", async () => {
    container.setAttribute("data-ci-theme", "dark");
    await act(() => root.render(<LifeReviewShareCard {...shareProps} />));
    await act(() =>
      container.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(downloadText).toHaveBeenCalledWith(
      "chess-insights-alice-life-review.svg",
      expect.stringContaining('fill="#262421"'),
      "image/svg+xml;charset=utf-8",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "SVG image",
    );
    vi.mocked(downloadText).mockImplementationOnce(() => {
      throw new Error("Download blocked");
    });
    await act(() =>
      root.render(<LifeReviewShareCard {...shareProps} username="bob" />),
    );
    await act(() =>
      container.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Download blocked",
    );
    await act(() =>
      container.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(vi.mocked(downloadText).mock.calls.at(-1)?.[0]).toBe(
      "chess-insights-bob-life-review.svg",
    );
  });
});

describe("session timeline", () => {
  it("plots chronological span in minutes, keeping recorded game time distinct and allowing all sessions", async () => {
    const sessions = [
      {
        id: "later",
        startTimestamp: Date.parse("2026-10-02T12:00:00Z"),
        endTimestamp: Date.parse("2026-10-02T12:10:00Z"),
        games: 2,
        durationSeconds: 600,
        recordedSeconds: 300,
      },
      {
        id: "earlier",
        startTimestamp: Date.parse("2026-10-01T12:00:00Z"),
        endTimestamp: Date.parse("2026-10-01T12:05:00Z"),
        games: 1,
        spanSeconds: 300,
        recordedSeconds: 300,
      },
    ];
    await act(() =>
      root.render(<SessionTimeline sessions={sessions} limit={1} />),
    );
    const focus =
      container.querySelector<SVGCircleElement>("circle[tabindex]")!;
    expect(focus.getAttribute("aria-label")).toContain(": 10 · ");
    expect(focus.getAttribute("aria-label")).toContain(
      "10m 00s session span · 5m 00s recorded play time",
    );
    expect(container.textContent).toContain(
      "Showing the latest 1 of 2 sessions.",
    );
    await act(() =>
      container.querySelector<HTMLButtonElement>("button")!.click(),
    );
    const points = [...container.querySelectorAll("circle[tabindex]")];
    expect(points).toHaveLength(2);
    expect(points[0].getAttribute("aria-label")).toContain(": 5 · ");
    expect(points[1].getAttribute("aria-label")).toContain(": 10 · ");
    expect(container.textContent).toContain(
      "Session span includes breaks between games.",
    );
    expect(sessions[0].id).toBe("later");
  });
  it("avoids inventing sessions when reliable intervals are absent", () => {
    const html = renderToStaticMarkup(<SessionTimeline sessions={[]} />);
    expect(html).toContain("No sessions with reliable start and end times");
    expect(html).not.toContain("<svg");
  });
});
