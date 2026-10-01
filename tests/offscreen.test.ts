import { it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Queue } from "../src/analysis/types";
const state = vi.hoisted(() => ({ queue: null as Queue | null }));
vi.mock("../src/data/storage/analysisRepository", () => ({
  analysisState: async () => ({ queue: state.queue }),
  updateAnalysisQueue: async (
    _username: string,
    update: (queue: Queue) => Queue | null,
  ) => {
    const next = state.queue ? update(state.queue) : null;
    if (next) state.queue = next;
    return next;
  },
}));
vi.mock("../src/background/engineAuthorization", () => ({
  engineAuthorization: async () => ({ token: "test-token" }),
  releaseEngine: async () => undefined,
}));
import { openEngine } from "../src/background/engineRuntime";
beforeEach(() => {
  vi.useFakeTimers();
  state.queue = {
    id: "alice",
    username: "alice",
    ids: ["g"],
    total: 1,
    completed: 0,
    status: "paused",
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function browser(
  createDocument: () => Promise<void> = vi.fn(async () => undefined),
  sendMessage = vi.fn(async () => ({ ok: true, data: true })),
) {
  vi.stubGlobal("chrome", {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getContexts: async () => [],
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
      sendMessage,
    },
    offscreen: { createDocument, Reason: { WORKERS: "WORKERS" } },
  });
  return { createDocument, sendMessage };
}
it("starts the engine in a bundled offscreen WORKERS context and detects an unclaimed host timeout", async () => {
  const api = browser();
  await openEngine("alice", {});
  expect(api.createDocument).toHaveBeenCalledWith(
    expect.objectContaining({ url: "engine-host.html", reasons: ["WORKERS"] }),
  );
  expect(api.sendMessage).toHaveBeenCalledWith({
    type: "ci:host-run",
    token: "test-token",
  });
  expect(state.queue?.status).toBe("initializing");
  await vi.advanceTimersByTimeAsync(15000);
  expect(state.queue).toMatchObject({
    status: "error",
    error: expect.stringContaining("15 seconds"),
  });
});
it("persists an actionable error when offscreen creation is rejected", async () => {
  browser(
    vi.fn(async () => {
      throw new Error("Offscreen unavailable");
    }),
  );
  await expect(openEngine("alice", {})).rejects.toThrow(
    "Offscreen unavailable",
  );
  expect(state.queue).toMatchObject({
    status: "error",
    error: expect.stringContaining("Could not initialize Stockfish"),
  });
});
it("does not restart a cancelled queue after offscreen creation finishes", async () => {
  let ready!: () => void;
  const api = browser(
    vi.fn(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    ),
  );
  const pending = openEngine("alice", {});
  await vi.waitFor(() => expect(state.queue?.status).toBe("initializing"));
  state.queue = { ...state.queue!, ids: [], status: "idle" };
  ready();
  await expect(pending).rejects.toThrow("cancelled");
  expect(api.sendMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "ci:host-run" }),
  );
  expect(state.queue).toMatchObject({ ids: [], status: "idle" });
});
it("ignores an old startup watchdog after a new run owns the queue", async () => {
  const api = browser();
  await openEngine("alice", {});
  state.queue = {
    ...state.queue!,
    engineRunToken: "new-run",
    status: "initializing",
  };
  await vi.advanceTimersByTimeAsync(15000);
  expect(api.sendMessage).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "ci:host-stop" }),
  );
  expect(state.queue).toMatchObject({
    engineRunToken: "new-run",
    status: "initializing",
  });
});
