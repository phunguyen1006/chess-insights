// @vitest-environment jsdom
import { beforeEach, it, expect, vi } from "vitest";
import {
  PuzzleTrackerMachine,
  readPuzzleObservation,
  isRatedPuzzlePage,
} from "../src/content/puzzles/tracker";
import type { PuzzleAttempt } from "../src/shared/types";
beforeEach(() => {
  document.body.innerHTML =
    '<section id="board-layout-sidebar"><div class="rated-sidebar-component"><span data-puzzle-id="42"></span><div role="status">White to move</div></div></section>';
  history.replaceState(null, "", "/puzzles/rated");
});
const root = () => document.getElementById("board-layout-sidebar")!;
const observe = () => readPuzzleObservation(root());
it("ignores puzzle initialization and only records completed results once", async () => {
  const save = vi.fn<(a: PuzzleAttempt) => Promise<unknown>>(async () => true),
    machine = new PuzzleTrackerMachine(save);
  await machine.observe("alice", observe());
  expect(save).not.toHaveBeenCalled();
  const status = root().querySelector('[role="status"]')!;
  status.setAttribute("data-puzzle-result", "solved");
  await machine.observe("alice", observe());
  await machine.observe("alice", observe());
  expect(save).toHaveBeenCalledTimes(1);
  status.removeAttribute("data-puzzle-result");
  root()
    .querySelector("[data-puzzle-id]")!
    .setAttribute("data-puzzle-id", "43");
  await machine.observe("alice", observe());
  status.setAttribute("data-puzzle-result", "failed");
  await machine.observe("alice", observe());
  status.setAttribute("data-puzzle-result", "solved");
  await machine.observe("alice", observe());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toMatchObject({
    result: "failed",
    puzzleId: "43",
  });
});
it("ignores result panels on first load and logged-out sessions", async () => {
  const save = vi.fn(async () => true),
    machine = new PuzzleTrackerMachine(save);
  root()
    .querySelector('[role="status"]')!
    .setAttribute("data-puzzle-result", "solved");
  await machine.observe("alice", observe());
  await machine.observe("", observe());
  expect(save).not.toHaveBeenCalled();
});
it("retains the completion ID over refresh and retries, including repeated puzzle IDs", async () => {
  const saved: PuzzleAttempt[] = [];
  let persisted: unknown;
  const machine = new PuzzleTrackerMachine(
    async (a) => {
      saved.push(a);
    },
    (s) => {
      persisted = s;
    },
  );
  await machine.observe("alice", observe());
  root()
    .querySelector('[role="status"]')!
    .setAttribute("data-puzzle-result", "failed");
  await machine.observe("alice", observe());
  const restored = new PuzzleTrackerMachine(
    async (a) => {
      saved.push(a);
    },
    () => undefined,
    persisted as ConstructorParameters<typeof PuzzleTrackerMachine>[2],
  );
  await restored.observe("alice", observe());
  expect(saved).toHaveLength(1);
  root()
    .querySelector('[role="status"]')!
    .removeAttribute("data-puzzle-result");
  restored.nextPuzzle();
  await restored.observe("alice", observe());
  root()
    .querySelector('[role="status"]')!
    .setAttribute("data-puzzle-result", "solved");
  await restored.observe("alice", observe());
  expect(saved).toHaveLength(2);
  expect(saved[0].id).not.toBe(saved[1].id);
});
it("never counts reviewing the solution after failure as a second solved attempt", async () => {
  const save = vi.fn<(a: PuzzleAttempt) => Promise<unknown>>(async () => true),
    machine = new PuzzleTrackerMachine(save);
  await machine.observe("alice", observe());
  const status = root().querySelector('[role="status"]')!;
  status.setAttribute("data-puzzle-result", "failed");
  await machine.observe("alice", observe());
  status.removeAttribute("data-puzzle-result");
  status.textContent = "White to move";
  await machine.observe("alice", observe());
  status.setAttribute("data-puzzle-result", "solved");
  await machine.observe("alice", observe());
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].result).toBe("failed");
});
it("supports metadata only, ignores wrong moves before terminal controls, and excludes other modes", () => {
  expect(isRatedPuzzlePage()).toBe(true);
  expect(isRatedPuzzlePage(document, "/puzzles/rush")).toBe(false);
  expect(isRatedPuzzlePage(document, "/daily-chess-puzzle")).toBe(false);
  expect(isRatedPuzzlePage(document, "/puzzles/battle")).toBe(false);
  root().querySelector('[role="status"]')!.textContent = "Incorrect";
  expect(observe().result).toBeNull();
  root().insertAdjacentHTML(
    "beforeend",
    "<button>Next Puzzle</button><div data-player-rating>1,510</div><div data-rating-change>−10</div>",
  );
  expect(observe()).toMatchObject({
    result: "failed",
    ratingAfter: 1510,
    ratingChange: -10,
  });
});
it("retries the same failed write without changing timestamp or account", async () => {
  const save = vi
      .fn<(a: PuzzleAttempt) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(true),
    machine = new PuzzleTrackerMachine(save);
  await machine.observe("alice", observe());
  root()
    .querySelector('[role="status"]')!
    .setAttribute("data-puzzle-result", "solved");
  await expect(machine.observe("alice", observe())).rejects.toThrow();
  await machine.observe("alice", observe());
  expect(save.mock.calls[0][0]).toEqual(save.mock.calls[1][0]);
});
