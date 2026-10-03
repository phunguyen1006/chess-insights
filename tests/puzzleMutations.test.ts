import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import type { PuzzleAttempt, Settings } from "../src/shared/types";

const state = vi.hoisted(() => ({
  settings: { trackPuzzleActivity: true } as Settings,
  settingGate: null as Promise<void> | null,
  clearGate: null as Promise<void> | null,
  importGate: null as Promise<void> | null,
  importBackup: vi.fn(async () => ({ imported: 1, skipped: 0, total: 1 })),
  exportBackup: vi.fn(async () => ({ attempts: [] })),
  save: vi.fn(async () => true),
  clear: vi.fn(async () => undefined),
  start: vi.fn(async () => ({ puzzleTrackingStartedAt: Date.now() })),
}));
vi.mock("../src/data/storage/settingsRepository", () => ({
  getSettings: async () => ({ ...state.settings }),
  setSettings: async (value: Settings) => {
    await state.settingGate;
    state.settings = { ...state.settings, ...value };
  },
}));
vi.mock("../src/data/storage/puzzleRepository", () => ({
  puzzleSnapshot: async () => ({ attempts: [], tracking: null }),
  savePuzzleAttempt: state.save,
  clearPuzzleHistory: async () => {
    await state.clearGate;
    await state.clear();
  },
  startPuzzleTracking: state.start,
}));
vi.mock("../src/data/storage/puzzleBackupRepository", () => ({
  importPuzzleBackup: async () => {
    await state.importGate;
    return state.importBackup();
  },
  exportPuzzleBackup: state.exportBackup,
}));
let handleMessage: typeof import("../src/background/serviceWorker").handleMessage;
beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: { onMessage: { addListener: vi.fn() } },
    storage: { local: { set: vi.fn(async () => undefined) } },
  });
  ({ handleMessage } = await import("../src/background/serviceWorker"));
});
beforeEach(() => {
  state.settings = { trackPuzzleActivity: true };
  state.settingGate = null;
  state.clearGate = null;
  state.importGate = null;
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllGlobals());
const attempt: PuzzleAttempt = {
  id: "alice:42:session",
  username: "alice",
  puzzleId: "42",
  attemptedAt: Date.now(),
  localDate: "2026-10-01",
  result: "solved",
  ratingBefore: null,
  ratingAfter: null,
  ratingChange: null,
  puzzleRating: null,
  source: "live_tracker",
  createdAt: Date.now(),
};
it("finishes a requested OFF before accepting a later completion", async () => {
  let finish!: () => void;
  state.settingGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const off = handleMessage({ type: "ci:puzzle-setting", enabled: false });
  const save = handleMessage({ type: "ci:puzzle-save", attempt });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.save).not.toHaveBeenCalled();
  finish();
  await off;
  expect(await save).toEqual({ ok: true, data: false });
  expect(state.save).not.toHaveBeenCalled();
});
it("finishes clearing and restarting the tracking boundary before a later write", async () => {
  let finish!: () => void;
  state.clearGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const clear = handleMessage({ type: "ci:puzzle-clear", username: "alice" });
  const save = handleMessage({ type: "ci:puzzle-save", attempt });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.save).not.toHaveBeenCalled();
  finish();
  await Promise.all([clear, save]);
  expect(state.start.mock.invocationCallOrder[0]).toBeLessThan(
    state.save.mock.invocationCallOrder[0],
  );
});
it("continues accepting valid puzzle messages after one mutation fails", async () => {
  state.settingGate = Promise.reject(new Error("Storage unavailable"));
  const failed = handleMessage({ type: "ci:puzzle-setting", enabled: false });
  expect(await failed).toMatchObject({ ok: false });
  state.settingGate = null;
  expect(await handleMessage({ type: "ci:puzzle-save", attempt })).toEqual({
    ok: true,
    data: true,
  });
});
it("serializes imports with Clear and backup export without enabling tracking", async () => {
  state.settings.trackPuzzleActivity = false;
  let finish!: () => void;
  state.importGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const imported = handleMessage({
    type: "ci:puzzle-import",
    username: "alice",
    text: "{}",
  });
  const cleared = handleMessage({ type: "ci:puzzle-clear", username: "alice" });
  const exported = handleMessage({
    type: "ci:puzzle-export",
    username: "alice",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(state.clear).not.toHaveBeenCalled();
  expect(state.exportBackup).not.toHaveBeenCalled();
  finish();
  expect(await imported).toMatchObject({ ok: true, data: { imported: 1 } });
  await Promise.all([cleared, exported]);
  expect(state.importBackup.mock.invocationCallOrder[0]).toBeLessThan(
    state.clear.mock.invocationCallOrder[0],
  );
  expect(state.clear.mock.invocationCallOrder[0]).toBeLessThan(
    state.exportBackup.mock.invocationCallOrder[0],
  );
  expect(state.settings.trackPuzzleActivity).toBe(false);
  expect(state.start).not.toHaveBeenCalled();
});
it("rejects a failed backup without broadcasting an update and allows the next request", async () => {
  state.importGate = Promise.reject(new Error("Invalid backup"));
  expect(
    await handleMessage({
      type: "ci:puzzle-import",
      username: "alice",
      text: "{}",
    }),
  ).toMatchObject({ ok: false, error: { message: "Invalid backup" } });
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  state.importGate = null;
  expect(
    await handleMessage({ type: "ci:puzzle-export", username: "alice" }),
  ).toMatchObject({ ok: true });
});
