// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useAppearance } from "../src/features/state/useAppearance";
import { AppearanceSettings } from "../src/features/insights/components/AppearanceSettings";
import { SETTINGS_KEY } from "../src/shared/constants";
import type { Settings, Request } from "../src/shared/types";
let stored: Settings,
  fail = false,
  container: HTMLDivElement,
  root: ReturnType<typeof createRoot>;
const listeners = new Set<
  (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
>();
function Harness() {
  const appearance = useAppearance();
  return (
    <div data-ci-theme={appearance.theme}>
      <AppearanceSettings appearance={appearance} />
    </div>
  );
}
beforeEach(() => {
  stored = { username: "alice", trackPuzzleActivity: false, theme: "light" };
  fail = false;
  listeners.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (message: Request) => {
        if (message.type === "ci:theme-setting") {
          if (fail)
            return {
              ok: false,
              error: { code: "STORAGE", message: "Unable to save appearance" },
            };
          stored = { ...stored, theme: message.theme };
          listeners.forEach((listener) =>
            listener({ [SETTINGS_KEY]: { newValue: { ...stored } } }, "local"),
          );
        }
        return { ok: true, data: { ...stored } };
      },
    },
    storage: {
      onChanged: {
        addListener: (
          listener: typeof listeners extends Set<infer T> ? T : never,
        ) => listeners.add(listener),
        removeListener: (
          listener: typeof listeners extends Set<infer T> ? T : never,
        ) => listeners.delete(listener),
      },
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
const select = () =>
  container.querySelector<HTMLSelectElement>(
    'select[aria-label="Color theme"]',
  )!;
async function change(value: string) {
  await act(async () => {
    select().value = value;
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("saves dark mode, preserves account/puzzle preferences, and restores it after remount", async () => {
  await act(() => root.render(<Harness />));
  expect(select().value).toBe("light");
  await change("dark");
  expect(container.firstElementChild?.getAttribute("data-ci-theme")).toBe(
    "dark",
  );
  expect(stored).toEqual({
    username: "alice",
    trackPuzzleActivity: false,
    theme: "dark",
  });
  await act(() => root.render(null));
  await act(() => root.render(<Harness />));
  expect(select().value).toBe("dark");
  await change("light");
  expect(container.firstElementChild?.getAttribute("data-ci-theme")).toBe(
    "light",
  );
});
it("updates other open surfaces from local settings changes and ignores session changes", async () => {
  await act(() => root.render(<Harness />));
  await act(() =>
    listeners.forEach((listener) =>
      listener({ [SETTINGS_KEY]: { newValue: { theme: "dark" } } }, "session"),
    ),
  );
  expect(select().value).toBe("light");
  await act(() =>
    listeners.forEach((listener) =>
      listener(
        { [SETTINGS_KEY]: { newValue: { ...stored, theme: "dark" } } },
        "local",
      ),
    ),
  );
  expect(select().value).toBe("dark");
});
it("keeps the current theme and exposes a recoverable error if saving fails", async () => {
  await act(() => root.render(<Harness />));
  fail = true;
  await change("dark");
  expect(select().value).toBe("light");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Unable to save appearance",
  );
  expect(select().disabled).toBe(false);
  fail = false;
  await change("dark");
  expect(select().value).toBe("dark");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
