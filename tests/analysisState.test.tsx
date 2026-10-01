// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAnalysis } from "../src/features/state/useAnalysis";
import type { AnalysisState } from "../src/analysis/types";
import type { Reply, Request } from "../src/shared/types";

let current: ReturnType<typeof useAnalysis>,
  root: ReturnType<typeof createRoot>,
  container: HTMLDivElement;
const pending: {
  username: string;
  resolve: (reply: Reply<AnalysisState>) => void;
}[] = [];
const state = (username: string): AnalysisState => ({
  clocks: [],
  analyses: [],
  reviews: [],
  mistakes: [],
  queue: {
    id: username,
    username,
    ids: [],
    completed: 0,
    total: 0,
    status: "idle",
  },
});
function Probe({ username }: { username: string }) {
  current = useAnalysis(username, []);
  return <p>{current.state.queue?.username}</p>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending.length = 0;
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (message: Extract<Request, { type: "ci:analysis" }>) =>
        new Promise<Reply<AnalysisState>>((resolve) =>
          pending.push({ username: message.username, resolve }),
        ),
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("does not apply an old account's request callback invoked after an account switch", async () => {
  await act(() => root.render(<Probe username="alice" />));
  const oldRequest = current.request;
  await act(() => root.render(<Probe username="bob" />));
  await act(async () =>
    pending
      .find((entry) => entry.username === "bob")!
      .resolve({ ok: true, data: state("bob") }),
  );
  let oldResponse!: Promise<AnalysisState>;
  await act(() => {
    oldResponse = oldRequest("state");
  });
  await act(async () =>
    pending.at(-1)!.resolve({ ok: true, data: state("alice") }),
  );
  await oldResponse;
  expect(current.state.queue?.username).toBe("bob");
  expect(container.textContent).toBe("bob");
});
