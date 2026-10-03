import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { useEffect, useState } from "react";
import { useData } from "../features/state/useData";
import { HomepageHeatmap } from "../features/heatmap/HomepageHeatmap";
import { InsightsApp } from "../features/insights/InsightsApp";
import { detectUsername, homepageTarget } from "./dom/chessDom";
import { integrate } from "./dom/integration";
import "../styles/theme.css";
import { analysisDebug } from "../features/state/useAnalysis";
import { playTimeDebug } from "../features/state/usePlayTime";
import { send } from "../features/state/client";
import { observePage } from "./dom/pageObserver";
import { installPuzzleTracker } from "./puzzles/tracker";
import { useAppearance } from "../features/state/useAppearance";
const puzzleTracker = installPuzzleTracker();
const roots = new Map<HTMLElement, Root>();
function syncTheme(element: HTMLElement) {
  if (element.id === "chess-insights-home-heatmap") {
    const buttons = document.querySelectorAll<HTMLElement>(
      'main a[href*="/play/online"],main button,[class*="home-play"] a',
    );
    for (const button of buttons) {
      if (button.closest(".ci-scope")) continue;
      const color = getComputedStyle(button).backgroundColor,
        channels = color.match(/\d+/g)?.map(Number);
      if (
        channels &&
        channels[1] > channels[0] * 1.1 &&
        channels[1] > channels[2] * 1.3 &&
        channels[1] > 80
      ) {
        element.style.setProperty("--ci-native-green", color);
        break;
      }
    }
  }
}
function Surface({
  kind,
  element,
}: {
  kind: "home" | "insights";
  element: HTMLElement;
}) {
  const appearance = useAppearance();
  useEffect(() => {
    element.classList.toggle("ci-theme-dark", appearance.theme === "dark");
  }, [appearance.theme, element]);
  const state = useData(),
    [detected, setDetected] = useState(detectUsername());
  useEffect(() => {
    const update = () => setDetected(detectUsername());
    window.addEventListener("ci:dom-update", update);
    return () => window.removeEventListener("ci:dom-update", update);
  }, []);
  useEffect(() => {
    if (state.settingsLoaded && detected && !state.username && !state.error)
      void state.connect(detected);
  }, [
    detected,
    state.username,
    state.settingsLoaded,
    state.error,
    state.connect,
  ]);
  return kind === "home" ? (
    <HomepageHeatmap state={state} detected={detected} />
  ) : (
    <InsightsApp state={state} detected={detected} />
  );
}
const mount = (element: HTMLElement, kind: "home" | "insights") => {
  syncTheme(element);
  const root = createRoot(element);
  roots.set(element, root);
  root.render(<Surface kind={kind} element={element} />);
};
const integration = integrate({
  home: (root) => mount(root, "home"),
  insights: (root) => mount(root, "insights"),
  unmount: (element) => {
    roots.get(element)?.unmount();
    roots.delete(element);
  },
});
observePage(() => {
  integration.update();
  roots.forEach((_root, element) => syncTheme(element));
  window.dispatchEvent(new Event("ci:dom-update"));
});
integration.update();
if (import.meta.env.DEV)
  Object.assign(window, {
    __CHESS_INSIGHTS_DEBUG__: {
      getPuzzleTrackingStatus: puzzleTracker.getPuzzleTrackingStatus,
      refreshActivityFromLocalData: () =>
        window.dispatchEvent(new Event("ci:refresh-local-activity")),
      findHomepageTargets: homepageTarget,
      getMountStatus: integration.getMountStatus,
      remountHeatmap: integration.remountHeatmap,
      getHeatmapGeometry: integration.getHeatmapGeometry,
      getTimeCoverage: () => analysisDebug.time,
      getPlayTimeCoverage: () => ({
        username: playTimeDebug.username,
        ...playTimeDebug.coverage,
        progress: playTimeDebug.progress,
      }),
      getSessionAnalyticsStatus: () => ({
        username: playTimeDebug.username,
        ...playTimeDebug.sessions,
        firstSession:
          playTimeDebug.sessions?.sessions.at(0)?.startTimestamp ?? null,
        lastSession:
          playTimeDebug.sessions?.sessions.at(-1)?.endTimestamp ?? null,
      }),
      getMistakeAnalysisStatus: () => ({
        ...analysisDebug.mistakes,
        totalHistoricalGames: analysisDebug.totalHistoricalGames,
        selectedScope: "unanalyzed",
        mistakesFound: analysisDebug.mistakesFound,
        selectedGames: analysisDebug.queue?.selected ?? 0,
        gamesWithPgn: analysisDebug.queue?.withPgn ?? 0,
        parseableGames: analysisDebug.queue?.parseable ?? 0,
        skippedGames: analysisDebug.queue?.skipped ?? 0,
        queuedGames: analysisDebug.queue?.ids.length ?? 0,
        analyzedGames: analysisDebug.mistakes.gamesAnalyzed,
        engine: analysisDebug.engine
          ? {
              ...analysisDebug.engine,
              initialized: analysisDebug.engine.readyOk,
            }
          : null,
        lastError: analysisDebug.queue?.error ?? null,
      }),
      getEngineStatus: () => ({
        ...(analysisDebug.engine ?? {
          workerCreated: false,
          wasmLoaded: false,
          uciOk: false,
          readyOk: false,
          running: false,
          error: null,
        }),
        error:
          analysisDebug.engine?.error ??
          (analysisDebug.queue?.status === "error"
            ? analysisDebug.queue.error
            : null) ??
          null,
      }),
      testEngine: () =>
        send({ type: "ci:engine-test", username: analysisDebug.username }),
      testStoredGameReplay: () =>
        send({ type: "ci:replay-test", username: analysisDebug.username }),
    },
  });
