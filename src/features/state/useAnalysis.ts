import { useCallback, useEffect, useRef, useState } from "react";
import { send } from "./client";
import type { AnalysisState } from "../../analysis/types";
import type { EngineStatus, Queue } from "../../analysis/types";
import type { NormalizedGame, Request } from "../../shared/types";
const empty: AnalysisState = {
  clocks: [],
  analyses: [],
  mistakes: [],
  reviews: [],
  queue: null,
};
export const analysisDebug = {
  username: "",
  totalHistoricalGames: 0,
  mistakesFound: { inaccuracies: 0, mistakes: 0, blunders: 0 },
  engine: null as EngineStatus | null,
  queue: null as Queue | null,
  time: { totalGames: 0, realTimeGames: 0, gamesWithClockData: 0, coverage: 0 },
  mistakes: { gamesAnalyzed: 0, queued: 0, mistakes: 0, engineRunning: false },
};
export function useAnalysis(
  username: string,
  games: NormalizedGame[],
  parseClocks = false,
  revision = 0,
) {
  const [state, setState] = useState(empty),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0);
  const generation = useRef(0);
  const previousDiagnostics = useRef("");
  const request = useCallback(
    async (
      action: Extract<Request, { type: "ci:analysis" }>["action"],
      extra: Partial<Extract<Request, { type: "ci:analysis" }>> = {},
    ) => {
      const gen = generation.current;
      try {
        const data = await send<AnalysisState>({
          ...extra,
          type: "ci:analysis",
          username,
          action,
          includeClocks: parseClocks,
        });
        if (gen === generation.current) {
          setState(data);
          setError("");
        }
        return data;
      } catch (e) {
        if (gen === generation.current)
          setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [username, parseClocks],
  );
  useEffect(() => {
    generation.current++;
    setState(empty);
    setProgress(0);
    void request("state").catch(() => undefined);
    return () => {
      generation.current++;
    };
  }, [request]);
  const gameKey = games.map((g) => g.id).join("|");
  useEffect(() => {
    if (!parseClocks) return;
    let active = true;
    const ids = gameKey.split("|").filter(Boolean);
    void (async () => {
      for (let i = 0; i < ids.length && active; i += 40) {
        await request("clocks", { ids: ids.slice(i, i + 40) });
        if (active) setProgress(Math.min(ids.length, i + 40));
      }
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [parseClocks, gameKey, request, revision]);
  useEffect(() => {
    analysisDebug.username = username;
    analysisDebug.totalHistoricalGames = games.length;
    analysisDebug.mistakesFound = {
      inaccuracies: state.mistakes.filter((m) => m.severity === "inaccuracy")
        .length,
      mistakes: state.mistakes.filter((m) => m.severity === "mistake").length,
      blunders: state.mistakes.filter((m) => m.severity === "blunder").length,
    };
    analysisDebug.engine = state.queue?.engine ?? null;
    analysisDebug.queue = state.queue;
    analysisDebug.mistakes = {
      gamesAnalyzed: state.analyses.length,
      queued: state.queue?.ids.length ?? 0,
      mistakes: state.mistakes.length,
      engineRunning: state.queue?.status === "running",
    };
    if (import.meta.env.DEV) {
      const details = JSON.stringify({
        ...analysisDebug.mistakes,
        status: state.queue?.status,
        engine: state.queue?.engine,
      });
      if (previousDiagnostics.current !== details)
        console.debug("[Chess Insights] UI requery", details);
      previousDiagnostics.current = details;
    }
  }, [state, username, games.length]);
  return { state, error, progress, request };
}
