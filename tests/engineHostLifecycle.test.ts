// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EngineStatus, Queue } from "../src/analysis/types";
import type { NormalizedGame } from "../src/shared/types";

const fixture = vi.hoisted(() => ({
  queue: null as Queue | null,
  listener: null as
    | ((
        message: Record<string, unknown>,
        sender: chrome.runtime.MessageSender,
        reply: (value: unknown) => void,
      ) => boolean)
    | null,
  ready: null as (() => void) | null,
  rejectReady: null as ((error: Error) => void) | null,
  analyze: vi.fn(async () => []),
  save: vi.fn(async () => undefined),
  stop: vi.fn(),
  release: vi.fn(),
}));
vi.mock("../src/data/storage/analysisRepository", () => ({
  analysisState: async () => ({ queue: fixture.queue, analyses: [] }),
  getAnalysisQueue: async () => fixture.queue,
  updateAnalysisQueue: async (
    _username: string,
    update: (current: Queue) => Queue | null,
  ) => {
    const next = fixture.queue ? update(fixture.queue) : null;
    if (next) fixture.queue = next;
    return next;
  },
  saveEngineGame: fixture.save,
}));
vi.mock("../src/data/storage/gameRepository", () => ({
  getGames: async () => [
    {
      id: "completed-game",
      username: "alice",
      rules: "chess",
      endTime: 1,
      playerColor: "white",
      opponentUsername: "bob",
      timeClass: "rapid",
      pgn: '[White "alice"]\n[Black "bob"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    } as NormalizedGame,
  ],
}));
vi.mock("../src/analysis/engine", () => ({
  storedGameReplay: () => ({ success: true }),
  analyzeGame: fixture.analyze,
  LocalEngine: class {
    status: EngineStatus = {
      workerCreated: true,
      wasmLoaded: false,
      uciOk: false,
      readyOk: false,
      running: false,
      error: null,
    };
    ready() {
      return new Promise<void>((resolve, reject) => {
        fixture.rejectReady = reject;
        fixture.ready = () => {
          this.status.uciOk =
            this.status.readyOk =
            this.status.wasmLoaded =
              true;
          resolve();
        };
      });
    }
    stop() {
      fixture.stop();
      fixture.rejectReady?.(new Error("Analysis stopped."));
    }
  },
}));
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DEV", false);
  vi.clearAllMocks();
  fixture.ready = null;
  fixture.rejectReady = null;
  fixture.queue = {
    id: "alice",
    username: "alice",
    engineRunToken: "run-1",
    ids: ["completed-game"],
    total: 1,
    completed: 0,
    status: "initializing",
  };
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener: (listener: typeof fixture.listener) => {
          fixture.listener = listener;
        },
      },
      sendMessage: async (message: { type: string }) => {
        if (message.type === "ci:engine-release") fixture.release();
        return {
          ok: true,
          data: message.type === "ci:engine-claim" ? "alice" : true,
        };
      },
    },
  });
  await import("../src/analysis/engineHost");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const sender = { id: "test", url: "chrome-extension://test/background.js" };
function start() {
  const reply = vi.fn();
  fixture.listener!({ type: "ci:host-run", token: "run-1" }, sender, reply);
  expect(reply).toHaveBeenCalledWith({ ok: true, data: true });
  return vi.waitFor(() => expect(fixture.ready).not.toBeNull());
}
it("preserves a pause issued while Stockfish is initializing", async () => {
  await start();
  fixture.queue = { ...fixture.queue!, status: "paused" };
  fixture.ready!();
  await vi.waitFor(() => expect(fixture.release).toHaveBeenCalled());
  expect(fixture.queue).toMatchObject({
    status: "paused",
    ids: ["completed-game"],
    engine: { running: false },
  });
  expect(fixture.analyze).not.toHaveBeenCalled();
});
it("does not let an obsolete host modify a replacement queue on cleanup", async () => {
  await start();
  fixture.queue = {
    ...fixture.queue!,
    engineRunToken: "run-2",
    status: "paused",
    ids: ["new-game"],
    completed: 3,
    engine: undefined,
  };
  fixture.ready!();
  await vi.waitFor(() => expect(fixture.release).toHaveBeenCalled());
  expect(fixture.queue).toMatchObject({
    engineRunToken: "run-2",
    status: "paused",
    ids: ["new-game"],
    completed: 3,
  });
  expect(fixture.queue?.engine).toBeUndefined();
  expect(fixture.save).not.toHaveBeenCalled();
});
it("acknowledges stop only after the old run has released its worker", async () => {
  await start();
  const stopped = vi.fn();
  expect(
    fixture.listener!(
      { type: "ci:host-stop", token: "run-1" },
      sender,
      stopped,
    ),
  ).toBe(true);
  expect(stopped).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(stopped).toHaveBeenCalledWith({ ok: true, data: true }),
  );
  fixture.queue = {
    ...fixture.queue!,
    engineRunToken: "run-2",
    status: "initializing",
  };
  const resumed = vi.fn();
  fixture.listener!({ type: "ci:host-run", token: "run-2" }, sender, resumed);
  expect(resumed).toHaveBeenCalledWith({ ok: true, data: true });
  const cleanup = vi.fn();
  fixture.listener!({ type: "ci:host-stop", token: "run-2" }, sender, cleanup);
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalled());
});
it("ignores an old watchdog stopping a different run", async () => {
  await start();
  const reply = vi.fn();
  fixture.listener!({ type: "ci:host-stop", token: "obsolete" }, sender, reply);
  expect(reply).toHaveBeenCalledWith({ ok: true, data: false });
  expect(fixture.stop).not.toHaveBeenCalled();
  fixture.queue = { ...fixture.queue!, status: "paused" };
  fixture.ready!();
  await vi.waitFor(() => expect(fixture.release).toHaveBeenCalled());
});
