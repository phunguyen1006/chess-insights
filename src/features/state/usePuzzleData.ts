import { useCallback, useEffect, useRef, useState } from "react";
import type { PuzzleSnapshot, Settings } from "../../shared/types";
import { send } from "./client";
const empty: PuzzleSnapshot = { attempts: [], tracking: null };
export function usePuzzleData(username: string) {
  const [data, setData] = useState(empty),
    [enabled, setEnabled] = useState(true),
    [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const gen = ++generation.current;
    if (!username) {
      setData(empty);
      setError("");
      return;
    }
    try {
      const [next, settings] = await Promise.all([
        send<PuzzleSnapshot>({ type: "ci:puzzles", username }),
        send<Settings>({ type: "ci:settings" }),
      ]);
      if (gen === generation.current) {
        setData(next);
        setEnabled(settings.trackPuzzleActivity !== false);
        setError("");
      }
    } catch (e) {
      if (gen === generation.current) setError(String(e));
    }
  }, [username]);
  useEffect(() => {
    setData(empty);
    setError("");
    void reload();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (
        (
          changes["chessInsights.puzzleChange"]?.newValue as
            { username?: string } | undefined
        )?.username === username ||
        changes["chessInsights.settings"]
      )
        void reload();
    };
    const refresh = () => {
      void reload();
    };
    chrome.storage.onChanged.addListener(listener);
    window.addEventListener("ci:refresh-local-activity", refresh);
    return () => {
      generation.current++;
      chrome.storage.onChanged.removeListener(listener);
      window.removeEventListener("ci:refresh-local-activity", refresh);
    };
  }, [username, reload]);
  return {
    data,
    enabled,
    error,
    reload,
    toggle: async (value: boolean) => {
      await send({ type: "ci:puzzle-setting", enabled: value });
      await reload();
    },
    clear: async () => {
      await send({ type: "ci:puzzle-clear", username });
      await reload();
    },
  };
}
