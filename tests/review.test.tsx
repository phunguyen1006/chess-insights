// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import { Chess } from "chess.js";
import { ReviewBoard } from "../src/features/insights/components/ReviewBoard";
import type { Mistake } from "../src/analysis/types";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
it("hides the answer, accepts a legal board move, then reveals and schedules it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const game = normalizeGame(
    {
      uuid: "review",
      end_time: 1790000000,
      time_class: "rapid",
      time_control: "600",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
    },
    "alice",
  )!;
  const m: Mistake = {
    id: "m:v1",
    username: "alice",
    gameId: game.id,
    ply: 1,
    moveNumber: 1,
    playerColor: "white",
    fenBefore: new Chess().fen(),
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
    bestLine: ["d4", "d5", "c4"],
    thinkSeconds: 2,
    inPressure: false,
  };
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element),
    grade = vi.fn();
  await act(() =>
    root.render(
      <ReviewBoard
        mistake={m}
        game={game}
        onGrade={grade}
        onClose={() => undefined}
      />,
    ),
  );
  expect(element.textContent).not.toContain("Best:");
  expect(element.querySelectorAll(".ci-board-square")).toHaveLength(64);
  expect(
    element.querySelector(".ci-board-square")?.getAttribute("aria-label"),
  ).toBe("a8 black r");
  await act(() =>
    element
      .querySelector<HTMLButtonElement>('[aria-label="d2 white p"]')!
      .click(),
  );
  await act(() =>
    element.querySelector<HTMLButtonElement>('[aria-label="d4"]')!.click(),
  );
  expect(element.textContent).toContain("Correct");
  expect(element.textContent).toContain("Best: d4");
  expect(element.textContent).not.toContain("d4 d5 c4");
  await act(() =>
    [...element.querySelectorAll("button")]
      .find((b) => b.textContent === "Show continuation")!
      .click(),
  );
  expect(element.textContent).toContain("d4 d5 c4");
  await act(() =>
    [...element.querySelectorAll("button")]
      .find((b) => b.textContent === "Good")!
      .click(),
  );
  expect(grade).toHaveBeenCalledWith("Good", true);
  await act(() => root.unmount());
  element.remove();
  vi.unstubAllGlobals();
});
