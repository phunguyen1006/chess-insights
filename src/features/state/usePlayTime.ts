import { useEffect, useRef, useState } from "react";
import { send } from "./client";
import type { GameDurationRecord } from "../../analysis/playTime";
import type { DurationProgress } from "../../data/storage/durationRepository";
import type {
  PlayTimeSummary,
  SessionAnalytics,
} from "../../analytics/playTime";

export const playTimeDebug = {
  username: "",
  coverage: null as PlayTimeSummary | null,
  sessions: null as SessionAnalytics | null,
  progress: null as DurationProgress | null,
};

export function usePlayTime(
  username: string,
  version: number,
  enabled: boolean,
) {
  const [state, setState] = useState({
    username: "",
    records: [] as GameDurationRecord[],
    loading: false,
    error: "",
    processed: 0,
    total: 0,
  });
  const generation = useRef(0);
  const current = useRef(username);
  current.current = username;
  useEffect(() => {
    const gen = ++generation.current;
    let cacheReloading = false,
      lastBucket = -1,
      responseSequence = 0,
      finalized = false;
    const valid = () =>
      generation.current === gen && current.current === username;
    const loadCache = async () => {
      const sequence = ++responseSequence;
      const records = await send<GameDurationRecord[]>({
        type: "ci:durations",
        username,
        action: "cache",
      });
      if (valid() && !finalized && sequence === responseSequence)
        setState((s) => ({ ...s, username, records }));
    };
    const listener = (message: {
      type?: string;
      username?: string;
      progress?: DurationProgress;
    }) => {
      if (
        message.type !== "ci:duration-progress" ||
        message.username !== username ||
        !message.progress ||
        !valid() ||
        finalized
      )
        return;
      const progress = message.progress;
      playTimeDebug.progress = progress;
      setState((s) => ({
        ...s,
        processed: Math.max(s.processed, progress.processed),
        total: progress.total,
      }));
      const bucket = Math.floor(
        (progress.processed / Math.max(1, progress.total)) * 5,
      );
      if (!cacheReloading && bucket > lastBucket) {
        lastBucket = bucket;
        cacheReloading = true;
        void loadCache()
          .catch(() => undefined)
          .finally(() => {
            cacheReloading = false;
          });
      }
    };
    if (!username) return;
    chrome.runtime.onMessage.addListener(listener);
    setState((s) =>
      s.username === username
        ? { ...s, loading: enabled, error: "", processed: 0, total: 0 }
        : {
            username,
            records: [],
            loading: enabled,
            error: "",
            processed: 0,
            total: 0,
          },
    );
    void (async () => {
      await loadCache();
      if (!enabled || !valid()) return;
      const records = await send<GameDurationRecord[]>({
        type: "ci:durations",
        username,
        action: "analyze",
      });
      if (valid()) {
        finalized = true;
        responseSequence++;
        setState((s) => ({
          ...s,
          username,
          records,
          loading: false,
          processed: records.length,
          total: records.length,
        }));
      }
    })().catch((e: unknown) => {
      if (valid())
        setState((s) => ({
          ...s,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        }));
    });
    return () => {
      generation.current++;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [username, version, enabled]);
  return state.username === username
    ? state
    : {
        records: [] as GameDurationRecord[],
        loading: enabled,
        error: "",
        processed: 0,
        total: 0,
      };
}
