// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAnalysis } from "../src/features/state/useAnalysis";
import type { Request } from "../src/shared/types";

let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const send = vi.fn(async (_message: Request) => ({
  ok: true,
  data: {
    clocks: [],
    analyses: [],
    reviews: [],
    mistakes: [],
    queue: null,
    selection: { total: 30, pending: 20, analyzed: 10, skipped: 0 },
  },
}));
let hidden: ReturnType<typeof vi.spyOn>;
function Probe() {
  useAnalysis("auditplayer", [], false, 0, true);
  return <p>Analysis preview</p>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
  hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  send.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("does not poll eligibility while hidden and refreshes once on returning", async () => {
  await act(() => root.render(<Probe />));
  send.mockClear();
  hidden.mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(send.mock.calls).toHaveLength(0);
  hidden.mockReturnValue(false);
  await act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(send.mock.calls.map(([m]) => ("action" in m ? m.action : ""))).toEqual(
    ["selection"],
  );
});
it("keeps visible polling and removes its timer and visibility listener on unmount", async () => {
  const add = vi.spyOn(document, "addEventListener"),
    remove = vi.spyOn(document, "removeEventListener");
  await act(() => root.render(<Probe />));
  send.mockClear();
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(send.mock.calls).toHaveLength(2);
  await act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  const listener = add.mock.calls.find(
    ([name]) => name === "visibilitychange",
  )?.[1];
  expect(listener).toBeDefined();
  expect(
    remove.mock.calls.some(
      ([name, callback]) =>
        name === "visibilitychange" && callback === listener,
    ),
  ).toBe(true);
});
