import { afterEach, expect, it, vi } from "vitest";
import { SETTINGS_KEY } from "../src/shared/constants";
import {
  getSettings,
  setSettings,
} from "../src/data/storage/settingsRepository";
import type { Settings } from "../src/shared/types";

afterEach(() => vi.unstubAllGlobals());

it("preserves concurrent account and puzzle preference updates", async () => {
  let stored: Settings = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => {
          const value = { [SETTINGS_KEY]: { ...stored } };
          await Promise.resolve();
          return value;
        }),
        set: vi.fn(async (value: Record<string, Settings>) => {
          await Promise.resolve();
          stored = value[SETTINGS_KEY];
        }),
      },
    },
  });
  await Promise.all([
    setSettings({ username: "alice" }),
    setSettings({ trackPuzzleActivity: false }),
    setSettings({ theme: "dark" }),
  ]);
  expect(await getSettings()).toEqual({
    username: "alice",
    trackPuzzleActivity: false,
    theme: "dark",
  });
});

it("allows later setting changes to succeed after a storage write fails", async () => {
  let stored: Settings = {};
  const set = vi
    .fn()
    .mockRejectedValueOnce(new Error("storage temporarily unavailable"))
    .mockImplementation(async (value: Record<string, Settings>) => {
      stored = value[SETTINGS_KEY];
    });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({ [SETTINGS_KEY]: { ...stored } })),
        set,
      },
    },
  });
  const first = setSettings({ username: "alice" });
  const failed = expect(first).rejects.toThrow(
    "storage temporarily unavailable",
  );
  const second = setSettings({ trackPuzzleActivity: false });
  await failed;
  await second;
  expect(await getSettings()).toEqual({
    trackPuzzleActivity: false,
    theme: "light",
  });
});
