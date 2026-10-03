// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { integrate } from "../src/content/dom/integration";
import { observePage } from "../src/content/dom/pageObserver";
import { IDS } from "../src/content/dom/chessDom";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";

it("keeps nodes, observers, listeners and timers bounded for 30 complete SPA cycles", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const NativeMutation = MutationObserver,
    active = new Set<MutationObserver>(),
    resize = new Set<ResizeObserver>();
  vi.stubGlobal(
    "MutationObserver",
    class extends NativeMutation {
      observe(target: Node, options: MutationObserverInit) {
        super.observe(target, options);
        active.add(this);
      }
      disconnect() {
        super.disconnect();
        active.delete(this);
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        resize.add(this as unknown as ResizeObserver);
      }
      disconnect() {
        resize.delete(this as unknown as ResizeObserver);
      }
    },
  );
  const nav =
    '<nav aria-label="Main navigation"><a href="/play">Play</a><a href="/puzzles">Puzzles</a><a href="/stats/auditplayer">Stats</a><a href="/train">Train</a><a href="/watch">Watch</a></nav>';
  const home =
    "<section><h2>Play Online</h2></section><div><section><h2>Recommended Match</h2></section><section><h2>Daily Puzzle</h2></section></div><section><h2>Game History</h2></section>";
  document.body.innerHTML = nav + "<main>" + home + "</main>";
  history.replaceState(null, "", "/home");
  const roots = new Map<HTMLElement, ReturnType<typeof createRoot>>();
  const mount = (el: HTMLElement) => {
    const root = createRoot(el);
    roots.set(el, root);
    root.render(<ActivityHeatmap games={[]} year={2026} onDate={() => {}} />);
  };
  const integration = integrate({
    home: mount,
    insights: mount,
    unmount: (el) => {
      roots.get(el)?.unmount();
      roots.delete(el);
    },
  });
  const add = vi.spyOn(window, "addEventListener"),
    remove = vi.spyOn(window, "removeEventListener");
  const updates = vi.fn(integration.update),
    watcher = observePage(updates);
  const samples: Record<string, number | string>[] = [];
  try {
    for (let cycle = 0; cycle < 30; cycle++) {
      for (const path of [
        "/home",
        "/play",
        "/game/live/123",
        "/analysis/game/live/123",
        "/member/auditplayer",
        "/stats/auditplayer",
        "/home",
        "/home#chess-insights/overview",
      ]) {
        await act(async () => {
          history.replaceState(null, "", path);
          document.querySelector("nav")!.outerHTML = nav;
          document.querySelector("main")!.innerHTML = path.startsWith("/home")
            ? home
            : "<h1>Native page</h1>";
          window.dispatchEvent(new PopStateEvent("popstate"));
          await vi.advanceTimersByTimeAsync(400);
        });
        const isInsights = path.includes("#chess-insights"),
          isHome = path === "/home";
        expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
        expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(
          isHome ? 1 : 0,
        );
        expect(document.querySelectorAll(`#${IDS.app}`)).toHaveLength(
          isInsights ? 1 : 0,
        );
        expect(roots.size).toBe(isHome || isInsights ? 1 : 0);
        expect(active.size).toBe(1);
        expect(resize.size).toBeLessThanOrEqual(2);
        expect(vi.getTimerCount()).toBe(0);
      }
      samples.push({
        cycle: cycle + 1,
        roots: roots.size,
        mutationObservers: active.size,
        resizeObservers: resize.size,
        timers: vi.getTimerCount(),
        windowListenerAdds: add.mock.calls.length,
        windowListenerRemoves: remove.mock.calls.length,
      });
    }
    // Idle extension DOM mutations are ignored and there is no page polling.
    const count = updates.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(updates.mock.calls.length).toBe(count);
    watcher.schedule();
    await act(() => {
      watcher.dispose();
      integration.dispose();
    });
    expect(active.size).toBe(0);
    expect(resize.size).toBe(0);
    expect(roots.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    // Every listener installed by observePage has the same callback removed.
    for (const [event, callback] of add.mock.calls)
      expect(
        remove.mock.calls.some(([e, c]) => e === event && c === callback),
      ).toBe(true);
    writeFileSync(
      "audit/reports/lifecycle.json",
      JSON.stringify(
        {
          status: "PASS",
          cycles: 30,
          navigations: 240,
          idleSeconds: 60,
          samples,
          afterDispose: {
            roots: roots.size,
            mutationObservers: active.size,
            resizeObservers: resize.size,
            timers: vi.getTimerCount(),
          },
          scope:
            "Real DOM integration + real React heatmap in jsdom. Browser heap and authenticated native DOM are not measured.",
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await act(() => {
      watcher.dispose();
      integration.dispose();
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}, 60_000);
