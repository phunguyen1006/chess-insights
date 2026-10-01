// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, it, expect, vi } from "vitest";
import { installPuzzleTracker } from "../src/content/puzzles/tracker";
import {
  clearPuzzleHistory,
  puzzleSnapshot,
  savePuzzleAttempt,
  startPuzzleTracking,
} from "../src/data/storage/puzzleRepository";
import { HomepageHeatmap } from "../src/features/heatmap/HomepageHeatmap";
import type { Request, Reply, PuzzleAttempt } from "../src/shared/types";
import type { DataState } from "../src/features/state/useData";
import { localDate, displayDate } from "../src/shared/dates";
import { historicalInsightsUrl } from "../src/analysis/safety";
const pause = () => new Promise((r) => setTimeout(r, 150));
async function waitForSummary(text: string) {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await pause();
    });
    if (document.querySelector(".ci-summary")?.textContent?.includes(text))
      return;
  }
  throw new Error(`Summary did not update to ${text}`);
}
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  sessionStorage.clear();
});
it("observes only rated completions, persists, broadcasts to mounted heatmap, survives refresh/account switch and OFF, with no engine requests", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  document.body.innerHTML =
    '<nav data-user-menu><a href="/member/alice">alice</a></nav><section id="board-layout-sidebar"><div class="rated-sidebar-component"><span data-puzzle-id="42"></span><div role="status">White to move</div></div></section><div id="home-proof"></div>';
  history.replaceState(null, "", "/puzzles/rated");
  const storageListeners = new Set<
      (changes: Record<string, chrome.storage.StorageChange>) => void
    >(),
    calls: Request[] = [];
  let enabled = true;
  const notify = (changes: Record<string, chrome.storage.StorageChange>) =>
    storageListeners.forEach((l) => l(changes));
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (message: Request): Promise<Reply<unknown>> => {
        calls.push(message);
        if (message.type === "ci:settings")
          return {
            ok: true,
            data: { username: "alice", trackPuzzleActivity: enabled },
          };
        if (message.type === "ci:puzzles")
          return { ok: true, data: await puzzleSnapshot(message.username) };
        if (message.type === "ci:puzzle-start") {
          const data = enabled
            ? await startPuzzleTracking(message.username)
            : null;
          notify({
            "chessInsights.puzzleChange": {
              newValue: {
                username: message.username,
                token: crypto.randomUUID(),
              },
            },
          });
          return { ok: true, data };
        }
        if (message.type === "ci:puzzle-save") {
          if (enabled) await savePuzzleAttempt(message.attempt);
          notify({
            "chessInsights.puzzleChange": {
              newValue: {
                username: message.attempt.username,
                token: crypto.randomUUID(),
              },
            },
          });
          return { ok: true, data: true };
        }
        throw new Error(`Unexpected request ${message.type}`);
      },
    },
    storage: {
      onChanged: {
        addListener: (
          l: (changes: Record<string, chrome.storage.StorageChange>) => void,
        ) => storageListeners.add(l),
        removeListener: (
          l: (changes: Record<string, chrome.storage.StorageChange>) => void,
        ) => storageListeners.delete(l),
      },
    },
  });
  await clearPuzzleHistory("alice");
  await clearPuzzleHistory("bob");
  const state: DataState = {
    data: { games: [], years: [2026], lastSync: 1, version: 1 },
    username: "alice",
    settingsLoaded: true,
    loading: false,
    error: "",
    refresh: vi.fn(),
    connect: vi.fn(),
  };
  const root = createRoot(document.getElementById("home-proof")!);
  let tracker = installPuzzleTracker();
  try {
    await act(() => {
      root.render(<HomepageHeatmap state={state} detected="alice" />);
    });
    await waitForSummary("Puzzle tracking started");
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(0);
    const status = document.querySelector('[role="status"]')!;
    await act(async () => {
      status.setAttribute("data-puzzle-result", "solved");
      await pause();
    });
    await waitForSummary("1 puzzles");
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(1);
    expect(document.querySelector(".ci-summary")?.textContent).toContain(
      "1 puzzles",
    );
    const today = document.querySelector(
      `button[aria-label^="${displayDate(localDate(new Date()))} —"]`,
    )!;
    expect(today.className).not.toContain("ci-level-0");
    await act(async () => {
      status.textContent = "Puzzle solved";
      await pause();
    });
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(1);
    tracker.dispose();
    tracker = installPuzzleTracker();
    await pause();
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(1);
    await act(async () => {
      status.removeAttribute("data-puzzle-result");
      document
        .querySelector("[data-puzzle-id]")!
        .setAttribute("data-puzzle-id", "43");
      await pause();
      status.setAttribute("data-puzzle-result", "failed");
      await pause();
    });
    await waitForSummary("2 puzzles");
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(2);
    expect(document.querySelector(".ci-summary")?.textContent).toContain(
      "2 puzzles",
    );
    await act(async () => {
      enabled = false;
      notify({
        "chessInsights.settings": { newValue: { trackPuzzleActivity: false } },
      });
      await pause();
      status.removeAttribute("data-puzzle-result");
      document
        .querySelector("[data-puzzle-id]")!
        .setAttribute("data-puzzle-id", "44");
      status.setAttribute("data-puzzle-result", "solved");
      await pause();
    });
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(2);
    await act(async () => {
      enabled = true;
      notify({
        "chessInsights.settings": { newValue: { trackPuzzleActivity: true } },
      });
      await pause();
      status.removeAttribute("data-puzzle-result");
      document.querySelector("nav a")!.setAttribute("href", "/member/bob");
      window.dispatchEvent(new Event("ci:dom-update"));
      await pause();
      status.setAttribute("data-puzzle-result", "solved");
      await pause();
    });
    expect((await puzzleSnapshot("bob")).attempts).toHaveLength(1);
    expect((await puzzleSnapshot("alice")).attempts).toHaveLength(2);
    expect(
      calls.some(
        (m) => m.type.startsWith("ci:engine") || m.type === "ci:analysis",
      ),
    ).toBe(false);
    expect(
      historicalInsightsUrl(
        "https://www.chess.com/puzzles/rated#chess-insights/mistakes",
      ),
    ).toBe(false);
  } finally {
    tracker.dispose();
    await act(() => root.unmount());
  }
}, 10000);
it("keeps completed attempts stable while a new puzzle begins before the previous write finishes", async () => {
  const { PuzzleTrackerMachine } =
    await import("../src/content/puzzles/tracker");
  const pending: { a: PuzzleAttempt; resolve: () => void }[] = [];
  const m = new PuzzleTrackerMachine(
    (a) => new Promise<void>((resolve) => pending.push({ a, resolve })),
  );
  const o = {
    puzzleId: "1",
    result: null,
    ratingAfter: null,
    ratingChange: null,
    puzzleRating: null,
  };
  await m.observe("alice", o);
  const first = m.observe("alice", { ...o, result: "failed" });
  m.nextPuzzle();
  await m.observe("alice", { ...o, puzzleId: "2" });
  const second = m.observe("alice", { ...o, puzzleId: "2", result: "solved" });
  expect(pending).toHaveLength(2);
  pending[0].resolve();
  await first;
  expect(m.session?.puzzleId).toBe("2");
  pending[1].resolve();
  await second;
  expect(m.state).toBe("saved");
  expect(pending[0].a.id).not.toBe(pending[1].a.id);
});
