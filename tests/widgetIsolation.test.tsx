// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { InsightsApp } from "../src/features/insights/InsightsApp";
vi.mock("../src/features/insights/pages/OverviewPage", () => ({
  OverviewPage: () => {
    throw new Error("Synthetic chart failure");
  },
}));
it("preserves navigation and account controls if a chart fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: async (m: { type: string }) => ({
        ok: true,
        data:
          m.type === "ci:puzzles"
            ? { attempts: [], tracking: null }
            : m.type === "ci:durations"
              ? []
              : {},
      }),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  history.replaceState(null, "", "/home#chess-insights/overview");
  const el = document.createElement("div"),
    root = createRoot(el),
    log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(() =>
      root.render(
        <InsightsApp
          detected={null}
          state={{
            username: "auditplayer",
            settingsLoaded: true,
            data: { games: [], years: [2026], version: 0, lastSync: 0 },
            loading: false,
            error: "",
            refresh: vi.fn(),
            connect: vi.fn(),
          }}
        />,
      ),
    );
    expect(el.querySelector('[aria-label="Insights sections"]')).not.toBeNull();
    expect(el.textContent).toContain("This view could not be displayed");
    expect(el.textContent).toContain("Settings");
  } finally {
    await act(() => root.unmount());
    log.mockRestore();
    vi.unstubAllGlobals();
  }
});
