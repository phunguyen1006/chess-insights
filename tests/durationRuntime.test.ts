import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { DurationProgress } from "../src/data/storage/durationRepository";
import type { Request } from "../src/shared/types";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(async () => [{ id: "cached" }]),
  ensure: vi.fn(
    async (_username: string, progress?: (p: DurationProgress) => void) => {
      progress?.({
        processed: 1,
        total: 1,
        withDuration: 1,
        pending: 0,
        done: true,
      });
      return [{ id: "analyzed" }];
    },
  ),
  gameSnapshot: vi.fn(async () => ({
    games: [],
    years: [],
    lastSync: 0,
    version: 1,
  })),
}));
vi.mock("../src/data/storage/durationRepository", () => ({
  durationSnapshot: mocks.snapshot,
  ensureGameDurations: mocks.ensure,
}));
vi.mock("../src/data/storage/settingsRepository", () => ({
  getSettings: async () => ({ username: "alice" }),
  setSettings: vi.fn(),
}));
vi.mock("../src/data/sync/syncManager", () => ({
  snapshot: mocks.gameSnapshot,
  syncYears: vi.fn(),
}));
let handleMessage: typeof import("../src/background/serviceWorker").handleMessage;
beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: { onMessage: { addListener: vi.fn() } },
    storage: { local: { set: vi.fn() } },
  });
  ({ handleMessage } = await import("../src/background/serviceWorker"));
});
beforeEach(() => vi.clearAllMocks());
afterAll(() => vi.unstubAllGlobals());
it("returns cached duration records without running the parser", async () => {
  expect(
    await handleMessage({
      type: "ci:durations",
      username: "ALICE",
      action: "cache",
    }),
  ).toEqual({ ok: true, data: [{ id: "cached" }] });
  expect(mocks.snapshot).toHaveBeenCalledWith("alice");
  expect(mocks.ensure).not.toHaveBeenCalled();
});
it("starts explicitly requested lazy analysis and forwards duration progress", async () => {
  const onProgress = vi.fn();
  expect(
    await handleMessage(
      { type: "ci:durations", username: "alice", action: "analyze" },
      undefined,
      onProgress,
    ),
  ).toEqual({ ok: true, data: [{ id: "analyzed" }] });
  expect(mocks.ensure).toHaveBeenCalledWith("alice", onProgress);
  expect(onProgress).toHaveBeenCalledWith(
    expect.objectContaining({ processed: 1, done: true }),
  );
});
it("does not start duration parsing for normal homepage settings and game-cache lookups", async () => {
  await handleMessage({ type: "ci:settings" });
  await handleMessage({ type: "ci:snapshot", username: "alice" });
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it("rejects invalid accounts before parser work and reports cache failures", async () => {
  expect(
    await handleMessage({
      type: "ci:durations",
      username: "not/a/user",
      action: "analyze",
    }),
  ).toMatchObject({ ok: false });
  expect(mocks.ensure).not.toHaveBeenCalled();
  mocks.snapshot.mockRejectedValueOnce(new Error("Storage failed"));
  expect(
    await handleMessage({
      type: "ci:durations",
      username: "alice",
      action: "cache",
    }),
  ).toMatchObject({ ok: false, error: { message: "Storage failed" } });
});
it("rejects unsupported duration actions instead of starting analysis", async () => {
  expect(
    await handleMessage({
      type: "ci:durations",
      username: "alice",
      action: "unexpected",
    } as unknown as Request),
  ).toMatchObject({ ok: false });
  expect(mocks.ensure).not.toHaveBeenCalled();
});
