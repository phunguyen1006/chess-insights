// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { OpponentsPage } from "../src/features/insights/pages/OpponentsPage";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import type { NormalizedGame } from "../src/shared/types";

function game(
  id: string,
  opponent: string | null = "bob",
  result: NormalizedGame["result"] = "win",
  rating: number | null = 1100,
) {
  const normalized = normalizeGame(
    {
      uuid: id,
      end_time: Date.UTC(2026, 9, 2, 10) / 1000 + Number(id),
      url: "https://www.chess.com/game/live/" + id,
      time_class: "rapid",
      rated: true,
      rules: "chess",
      white: {
        username: "alice",
        rating: 1000,
        result:
          result === "win" ? "win" : result === "draw" ? "agreed" : "resigned",
      },
      black: {
        username: opponent ?? undefined,
        rating: rating ?? undefined,
        result:
          result === "win" ? "resigned" : result === "draw" ? "agreed" : "win",
      },
    },
    "alice",
  )!;
  return { ...normalized, opponentUsername: opponent, opponentRating: rating };
}
const games = [
  game("1"),
  game("2", "BOB", "draw"),
  game("3", "bob", "loss"),
  game("4"),
  game("5"),
  game("6", "carol", "win", 1900),
];
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === label,
  )!;
async function render(list = games) {
  await act(() => root.render(<OpponentsPage games={list} allGames={list} />));
}
it("leads with a compact head-to-head table and preserves case-insensitive opponent game details", async () => {
  await render();
  expect(container.querySelector("section h3")?.textContent).toBe(
    "Head-to-head Opponents",
  );
  const firstRow = container.querySelector("table tbody tr")!;
  expect(
    [...firstRow.querySelectorAll("td")].map((cell) => cell.textContent),
  ).toEqual(["bob", "5", "3 / 1 / 1", "60.0%", "1,100"]);
  await act(() => button("bob").click());
  const details = [...container.querySelectorAll("section")].find(
    (section) => section.querySelector("h3")?.textContent === "Games vs bob",
  )!;
  expect(details.querySelectorAll('a[target="_blank"]').length).toBe(5);
  expect(
    details.querySelector('[role="img"]')?.getAttribute("aria-label"),
  ).toBe("Results vs bob: 3 wins, 1 draws, 1 losses");
});
it("places highlights in shared rows and keeps secondary plots inside a closed disclosure", async () => {
  await render();
  const highlights = [...container.querySelectorAll("section")].find(
    (section) => section.querySelector("h3")?.textContent === "Highlights",
  )!;
  expect(highlights.querySelectorAll(".ci-section-row").length).toBe(5);
  expect(highlights.textContent).toContain(
    "Best Head-to-headbob · 5 games60.0%",
  );
  expect(highlights.textContent).toContain("1,900");
  const extra = container.querySelector<HTMLDetailsElement>("details")!;
  expect(extra.open).toBe(false);
  expect(extra.querySelector("summary")?.textContent).toBe(
    "More opponent details",
  );
  expect(
    extra.querySelector('svg[aria-label="Opponent rating and result score"]'),
  ).not.toBeNull();
});
it("filters opponent names without dropping the available complete game list", async () => {
  await render();
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="Find an opponent"]',
  )!;
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "CAR");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelector("table tbody")?.textContent).toContain(
    "carol",
  );
  expect(container.querySelector("table tbody")?.textContent).not.toContain(
    "bob",
  );
  await act(() => button("carol").click());
  expect(container.textContent).toContain("Games vs carol");
});
it("uses unknown values for missing ratings and avoids unsupported head-to-head highlights", async () => {
  await render([game("1", "bob", "win", null), game("2", null, "loss", null)]);
  expect(
    container.querySelector("table tbody td:last-child")?.textContent,
  ).toBe("—");
  const highlights = [...container.querySelectorAll("section")].find(
    (section) => section.querySelector("h3")?.textContent === "Highlights",
  )!;
  expect(highlights.textContent).toContain(
    "Requires 5 games against one opponent",
  );
  expect(highlights.querySelectorAll('a[target="_blank"]').length).toBe(0);
});
