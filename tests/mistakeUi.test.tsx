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
  send: vi.fn(),
}));
vi.mock("../src/features/state/useAnalysis", () => ({
  useAnalysis: () => ({ state: mock.state, error: "", request: mock.request }),
}));
vi.mock("../src/features/state/client", () => ({ send: mock.send }));
import { MistakesPage } from "../src/features/insights/pages/MistakesPage";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import type { Mistake } from "../src/analysis/types";
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
  mock.send.mockReset();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function reviewFixture(count: number) {
  const game = normalizeGame(
    {
      uuid: "review-session",
      end_time: 1790000000,
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
  mock.state.mistakes = Array.from({ length: count }, (_, index): Mistake => ({
    id: `${game.id}:${index * 2 + 1}:v1`,
    username: "alice",
    gameId: game.id,
    ply: index * 2 + 1,
    moveNumber: index + 1,
    playerColor: "white",
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playedMoveUci: "e2e4",
    playedMoveSan: "e4",
    bestMoveUci: "d2d4",
    bestMoveSan: "d4",
    evalBest: { type: "cp", value: 100 },
    evalPlayed: { type: "cp", value: -150 },
    centipawnLoss: 250,
    mateTransition: null,
    severity: "blunder",
    phase: "opening",
    opening: null,
    createdAt: 1,
    bestLine: ["d4"],
    thinkSeconds: null,
    inPressure: null,
  }));
  return game;
}
it("organizes historical mistakes into six native sections with severity bars and filtered positions", async () => {
  const game = reviewFixture(3);
  mock.state.mistakes[1].severity = "mistake";
  mock.state.mistakes[1].phase = "middlegame";
  mock.state.mistakes[2].severity = "inaccuracy";
  mock.state.mistakes[2].phase = "endgame";
  await act(() =>
    root.render(<MistakesPage username="alice" games={[game]} />),
  );
  const nav = container.querySelector('nav[aria-label="Mistake statistics"]')!;
  expect(
    [...nav.querySelectorAll("button")].map((button) => button.textContent),
  ).toEqual([
    "Overview",
    "Blunders",
    "Mistakes",
    "Inaccuracies",
    "By Phase",
    "Review",
  ]);
  expect(container.querySelector(".ci-donut")).toBeNull();
  expect(
    [...container.querySelectorAll(".ci-severity-bars .ci-bar-row strong")].map(
      (value) => value.textContent,
    ),
  ).toEqual(["1", "1", "1"]);
  await act(() =>
    [...nav.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Blunders")!
      .click(),
  );
  expect(container.querySelectorAll(".ci-mistake-card")).toHaveLength(1);
  expect(container.querySelector(".ci-mistake-card")?.textContent).toContain(
    "Move 1",
  );
  expect(container.querySelector('select[aria-label="Severity"]')).toBeNull();
  await act(() =>
    [...nav.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Inaccuracies")!
      .click(),
  );
  expect(container.querySelectorAll(".ci-mistake-card")).toHaveLength(1);
  expect(container.querySelector(".ci-mistake-card")?.textContent).toContain(
    "Move 3",
  );
  await act(() =>
    [...nav.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "By Phase")!
      .click(),
  );
  expect(container.querySelectorAll(".ci-mistake-card")).toHaveLength(3);
  expect(
    container.querySelector(
      'nav[aria-label="Mistake statistics"] button[aria-current="page"]',
    )?.textContent,
  ).toBe("By Phase");
  expect(mock.state.mistakes).toHaveLength(3);
});
it("starts a review from the active severity section without changing the stored bank", async () => {
  const game = reviewFixture(2);
  mock.state.mistakes[1].severity = "inaccuracy";
  await act(() =>
    root.render(<MistakesPage username="alice" games={[game]} />),
  );
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (entry) => entry.textContent === label,
    )!;
  await act(() => button("Blunders").click());
  await act(() => button("Start Review").click());
  expect(
    container.querySelector(
      'nav[aria-label="Mistake statistics"] button[aria-current="page"]',
    )?.textContent,
  ).toBe("Review");
  expect(container.textContent).toContain("Review 1 / 1");
  expect(container.textContent).toContain("Review position · Move 1");
  expect(mock.state.mistakes).toHaveLength(2);
});
it("shows an accurate empty-state CTA with just the unanalyzed scope", async () => {
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(container.textContent).toContain("No games analyzed yet.");
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "Checking games…",
  );
  expect(
    container.querySelector<HTMLButtonElement>("button.ci-primary")?.disabled,
  ).toBe(true);
  expect(
    [
      ...container.querySelectorAll(
        'select[aria-label="Analyze scope"] option',
      ),
    ].map((o) => o.textContent),
  ).toEqual(["Unanalyzed games"]);
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
it("offers every remaining game after an earlier batch completed and queues the global scope", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mock.state.selection = {
    total: 1000,
    analyzed: 108,
    pending: 890,
    skipped: 2,
  };
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: [],
    completed: 20,
    total: 20,
    status: "idle",
  };
  mock.request.mockClear();
  mock.request.mockResolvedValue(mock.state);
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  const button =
    container.querySelector<HTMLButtonElement>("button.ci-primary")!;
  expect(button.textContent).toBe("Analyze 890 games");
  expect(button.disabled).toBe(false);
  expect(container.textContent).toContain("890 games ready to analyze");
  expect(container.textContent).not.toContain("Reanalyze cached games");
  await act(() => button.click());
  expect(mock.request).toHaveBeenCalledWith("enqueue", { scope: "unanalyzed" });
});
it("disables a new batch during full-history sync and when all eligible games are analyzed", async () => {
  mock.state.selection = { total: 100, analyzed: 80, pending: 20, skipped: 0 };
  await act(() =>
    root.render(<MistakesPage username="alice" games={[]} loadingHistory />),
  );
  expect(
    container.querySelector<HTMLButtonElement>("button.ci-primary")?.disabled,
  ).toBe(true);
  expect(container.textContent).toContain("Loading full public game history");
  mock.state.selection = { total: 100, analyzed: 100, pending: 0, skipped: 0 };
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  expect(
    container.querySelector<HTMLButtonElement>("button.ci-primary")?.disabled,
  ).toBe(true);
  expect(container.querySelector("button.ci-primary")?.textContent).toBe(
    "No unanalyzed games",
  );
});
it("recovers a paused queue with a stale running flag when its engine no longer exists", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    total: 2,
    completed: 1,
    status: "paused",
    engine: {
      workerCreated: true,
      wasmLoaded: true,
      uciOk: true,
      readyOk: true,
      running: true,
      error: null,
    },
  };
  mock.request.mockClear();
  mock.request.mockResolvedValue(mock.state);
  mock.send.mockResolvedValue({ active: false });
  try {
    await act(() => root.render(<MistakesPage username="alice" games={[]} />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mock.send).toHaveBeenCalledWith({
      type: "ci:engine-status",
      username: "alice",
    });
    expect(mock.request).toHaveBeenCalledWith("pause");
    expect(mock.state.queue.ids).toEqual(["g"]);
    expect(mock.state.queue.completed).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});
it("retries the failed pending queue instead of replacing it with the selected scope", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: Array.from({ length: 70 }, (_, index) => `pending-${index}`),
    completed: 30,
    total: 100,
    status: "error",
    error: "Stockfish timed out.",
  };
  mock.request.mockClear();
  mock.request.mockResolvedValue(mock.state);
  mock.send.mockResolvedValue({ token: "resume-failed-queue" });
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  const primary =
    container.querySelector<HTMLButtonElement>("button.ci-primary")!;
  expect(primary.textContent).toBe("Retry Analysis");
  await act(() => primary.click());
  expect(mock.send).toHaveBeenCalledWith({
    type: "ci:engine-open",
    username: "alice",
  });
  expect(mock.request).not.toHaveBeenCalledWith("enqueue", expect.anything());
  expect(mock.state.queue).toMatchObject({ completed: 30, total: 100 });
  expect(mock.state.queue.ids).toHaveLength(70);
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
it("provides pause during startup instead of a second Resume control", async () => {
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    total: 1,
    completed: 0,
    status: "initializing",
  };
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  const buttons = [...container.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons.some((button) => button.textContent === "Pause")).toBe(true);
  expect(buttons.some((button) => button.textContent === "Resume")).toBe(false);
});
it("saves a review once when a grade is clicked repeatedly before storage replies", async () => {
  const game = normalizeGame(
    {
      uuid: "review-once",
      end_time: 1790000000,
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
  mock.state.mistakes = [
    {
      id: "review-once:v1",
      username: "alice",
      gameId: game.id,
      ply: 1,
      moveNumber: 1,
      playerColor: "white",
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      playedMoveUci: "e2e4",
      playedMoveSan: "e4",
      bestMoveUci: "d2d4",
      bestMoveSan: "d4",
      evalBest: { type: "cp", value: 100 },
      evalPlayed: { type: "cp", value: -150 },
      centipawnLoss: 250,
      mateTransition: null,
      severity: "blunder",
      phase: "opening",
      opening: null,
      createdAt: 1,
      bestLine: ["d4"],
      thinkSeconds: null,
      inPressure: null,
    },
  ];
  let finish!: () => void;
  mock.request.mockClear();
  mock.request.mockImplementation((action: string) =>
    action === "review"
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(mock.state),
  );
  await act(() =>
    root.render(<MistakesPage username="alice" games={[game]} />),
  );
  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent === label,
    )!;
  await act(() => button("Start Review").click());
  await act(() => button("Reveal answer").click());
  await act(() => {
    button("Good").click();
    button("Good").click();
  });
  expect(
    mock.request.mock.calls.filter(([action]) => action === "review"),
  ).toHaveLength(1);
  expect(button("Good").disabled).toBe(true);
  await act(async () => finish());
  expect(container.textContent).toContain(
    "1 reviewed · 0 correct first try · 1 need more practice",
  );
});
it("stops startup if the tab becomes hidden while authorization is pending", async () => {
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  let authorized!: (value: { token: string }) => void;
  mock.send.mockImplementation((message: { type: string }) =>
    message.type === "ci:engine-open"
      ? new Promise<{ token: string }>((resolve) => {
          authorized = resolve;
        })
      : Promise.resolve(true),
  );
  mock.state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    total: 1,
    completed: 0,
    status: "paused",
  };
  mock.request.mockClear();
  mock.request.mockResolvedValue(mock.state);
  await act(() => root.render(<MistakesPage username="alice" games={[]} />));
  await act(() =>
    container.querySelector<HTMLButtonElement>("button.ci-primary")!.click(),
  );
  hidden = true;
  await act(async () => authorized({ token: "hidden-start" }));
  expect(mock.send).toHaveBeenCalledWith({
    type: "ci:engine-stop",
    username: "alice",
  });
  expect(mock.request).toHaveBeenCalledWith("pause");
  expect(container.querySelector("iframe")).toBeNull();
});
it.each(["close", "restart", "select"] as const)(
  "does not let a pending grade overwrite review navigation after %s",
  async (navigation) => {
    const game = reviewFixture(3);
    let finish!: () => void;
    mock.request.mockClear();
    mock.request.mockImplementation((action: string) =>
      action === "review"
        ? new Promise<void>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(mock.state),
    );
    await act(() =>
      root.render(<MistakesPage username="alice" games={[game]} />),
    );
    const button = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (element) => element.textContent === label,
      )!;
    await act(() => button("Start Review").click());
    await act(() => button("Reveal answer").click());
    await act(() => button("Good").click());
    if (navigation === "close") await act(() => button("Close review").click());
    else if (navigation === "restart")
      await act(() => button("Start Review").click());
    else
      await act(() =>
        [
          ...container.querySelectorAll<HTMLButtonElement>(
            ".ci-mistake-card button",
          ),
        ][2].click(),
      );
    await act(async () => finish());
    expect(
      mock.request.mock.calls.filter(([action]) => action === "review"),
    ).toHaveLength(1);
    if (navigation === "close") {
      expect(container.querySelector(".ci-review-layout")).toBeNull();
      expect(container.textContent).not.toContain("Review 2 / 3");
    } else if (navigation === "restart") {
      expect(container.textContent).toContain("Review position · Move 1");
      expect(container.textContent).toContain("Review 1 / 3");
      expect(container.textContent).not.toContain("Review 2 / 3");
      expect(
        container.querySelector(".ci-review-layout")?.textContent,
      ).not.toContain("Best:");
    } else {
      expect(container.textContent).toContain("Review position · Move 3");
      expect(container.textContent).not.toContain("Review position · Move 2");
    }
  },
);
