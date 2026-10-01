// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AnalysisState } from "../src/analysis/types";
const mock = vi.hoisted(() => ({
  state: {
    clocks: [],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  } as AnalysisState,
  request: vi.fn(),
}));
vi.mock("../src/features/state/useAnalysis", () => ({
  useAnalysis: () => ({ state: mock.state, error: "", request: mock.request }),
}));
import { MistakesPage } from "../src/features/insights/pages/MistakesPage";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.state = {
    clocks: [],
    analyses: [],
    mistakes: [],
    reviews: [],
    queue: null,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  history.replaceState(null, "", "/home#chess-insights/mistakes");
  mock.request.mockResolvedValue(mock.state);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows a primary recent-20 empty-state CTA without zero-filled charts", async () => {
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(container.textContent).toContain("No games analyzed yet.");
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "Analyze Recent 20 Games",
  );
  expect(container.textContent).not.toContain("Severity distribution");
});
it("exposes failed initialization and a retry instead of silently showing zeros", async () => {
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    completed: 0,
    total: 1,
    status: "error",
    error: "Stockfish failed to initialize.",
  };
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(container.textContent).toContain("Stockfish failed to initialize.");
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "Retry Analysis",
  );
});
it("disables duplicate startup/running clicks and exposes real progress", async () => {
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    completed: 4,
    total: 20,
    status: "initializing",
  };
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(
    container.querySelector<HTMLButtonElement>("button.ci-primary")?.disabled,
  ).toBe(true);
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "Loading engine…",
  );
  mock.state = {
    ...mock.state,
    queue: {
      ...mock.state.queue,
      status: "running",
      currentGame: "vs bob · blitz",
    },
  };
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "Analyzing 5 / 20",
  );
  expect(container.querySelector<HTMLProgressElement>("progress")?.value).toBe(
    4,
  );
  expect(container.textContent).toContain("vs bob · blitz");
});
it("distinguishes a successful analyzed game with no qualifying mistakes from no analysis", async () => {
  const game = normalizeGame(
    {
      uuid: "g",
      end_time: 1790000000,
      time_class: "rapid",
      rules: "chess",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
    },
    "alice",
  )!;
  mock.state.analyses = [
    {
      id: game.id,
      username: "alice",
      analysisVersion: 1,
      engineVersion: "test",
      nodes: 20000,
      analyzedAt: 1,
      source: "test",
    },
  ];
  await act(() =>
    root.render(<MistakesPage username="alice" games={[game]} />),
  );
  expect(container.textContent).toContain(
    "1 games analyzed. No mistakes exceeded the current classification thresholds.",
  );
  expect(container.textContent).not.toContain("No games analyzed yet.");
});
