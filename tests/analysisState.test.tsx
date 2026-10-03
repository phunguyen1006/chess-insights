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
  action: string;
  includeSelection?: boolean;
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
function Probe({
  username,
  preview = false,
}: {
  username: string;
  preview?: boolean;
}) {
  current = useAnalysis(username, [], false, 0, preview);
  return <p>{current.state.queue?.username}</p>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending.length = 0;
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (message: Extract<Request, { type: "ci:analysis" }>) =>
        new Promise<Reply<AnalysisState>>((resolve) =>
          pending.push({
            username: message.username,
            action: message.action,
            includeSelection: message.includeSelection,
            resolve,
          }),
        ),
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
it("loads 108 saved analyses before a delayed eligibility preview and coalesces polls", async () => {
  await act(() => root.render(<Probe username="alice" preview />));
  const saved = {
    ...state("alice"),
    analyses: Array.from({ length: 108 }, (_, i) => ({
      id: `old-${i}`,
      username: "alice",
      analysisVersion: 1,
      engineVersion: "old",
      nodes: 20000,
      analyzedAt: 1,
      source: "pgn",
    })),
  };
  expect(pending.find((p) => p.action === "state")?.includeSelection).toBe(
    false,
  );
  expect(current.loaded).toBe(false);
  await act(async () =>
    pending
      .find((p) => p.action === "state")!
      .resolve({ ok: true, data: saved }),
  );
  expect(current.loaded).toBe(true);
  expect(current.state.analyses).toHaveLength(108);
  let a!: Promise<AnalysisState>, b!: Promise<AnalysisState>;
  await act(() => {
    a = current.request("selection");
    b = current.request("selection");
  });
  expect(a).toBe(b);
  expect(pending.filter((p) => p.action === "selection")).toHaveLength(1);
  await act(async () =>
    pending
      .find((p) => p.action === "selection")!
      .resolve({
        ok: true,
        data: {
          ...state("alice"),
          selection: { total: 1000, pending: 892, analyzed: 108, skipped: 0 },
        },
      }),
  );
  // A stale preview carries no newer analysis/queue snapshot; only counts merge.
  expect(current.state.analyses).toHaveLength(108);
  expect(current.state.selection?.pending).toBe(892);
  await act(() => {
    a = current.request("state");
    b = current.request("state");
  });
  expect(a).toBe(b);
  await act(async () => pending.at(-1)!.resolve({ ok: true, data: saved }));
  expect(current.state.selection?.pending).toBe(892);
});
it("does not let an earlier poll undo a completed cancellation", async () => {
  await act(() => root.render(<Probe username="alice" />));
  const poll = pending[0];
  let cancel!: Promise<AnalysisState>;
  await act(() => {
    cancel = current.request("cancel");
  });
  await act(async () =>
    pending.at(-1)!.resolve({ ok: true, data: state("alice") }),
  );
  await cancel;
  await act(async () =>
    poll.resolve({
      ok: true,
      data: {
        ...state("alice"),
        queue: {
          ...state("alice").queue!,
          ids: ["old"],
          total: 1,
          status: "running",
        },
      },
    }),
  );
  expect(current.state.queue?.status).toBe("idle");
  expect(current.state.queue?.ids).toEqual([]);
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
