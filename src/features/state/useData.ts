import { useEffect, useState, useCallback, useRef } from "react";
import type { Snapshot, Settings } from "../../shared/types";
import { send } from "./client";
const initial: Snapshot = {
  games: [],
  years: [new Date().getFullYear()],
  lastSync: 0,
  version: 0,
};
export function useData() {
  const [data, setData] = useState(initial),
    [username, setUsername] = useState(""),
    [settingsLoaded, setSettingsLoaded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const account = useRef(""),
    busy = useRef(false),
    generation = useRef(0),
    requested = useRef(new Set<number>()),
    forceRequested = useRef(false);
  const refresh = useCallback(async (years: number[], force = false) => {
    if (!account.current) return;
    years.forEach((y) => requested.current.add(y));
    forceRequested.current ||= force;
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    const user = account.current,
      gen = generation.current;
    try {
      while (requested.current.size && gen === generation.current) {
        const pending = [...requested.current],
          forced = forceRequested.current;
        requested.current.clear();
        forceRequested.current = false;
        for (const year of pending) {
          if (gen !== generation.current) break;
          const next = await send<Snapshot>({
            type: "ci:sync",
            username: user,
            years: [year],
            force: forced && year === pending[0],
          });
          if (gen === generation.current) setData(next);
        }
      }
    } catch (e) {
      if (gen === generation.current) {
        try {
          const cached = await send<Snapshot>({
            type: "ci:snapshot",
            username: user,
          });
          if (gen === generation.current) setData(cached);
        } catch {
          /* Keep already displayed data if local storage is unavailable. */
        }
        if (gen === generation.current)
          setError(e instanceof Error ? e.message : "Unable to refresh.");
      }
    } finally {
      if (gen === generation.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, []);
  const activate = useCallback(
    async (user: string) => {
      generation.current++;
      const gen = generation.current;
      account.current = user;
      busy.current = false;
      requested.current.clear();
      forceRequested.current = false;
      setUsername(user);
      setData(initial);
      setError("");
      setLoading(true);
      try {
        const cached = await send<Snapshot>({
          type: "ci:snapshot",
          username: user,
        });
        if (gen !== generation.current) return;
        setData(cached);
        void refresh([new Date().getFullYear()]);
      } catch (e) {
        if (gen === generation.current) {
          setError(String(e));
          setLoading(false);
        }
      }
    },
    [refresh],
  );
  const connect = useCallback(
    async (user: string) => {
      setError("");
      try {
        const settings = await send<Settings>({
          type: "ci:connect",
          username: user.trim(),
        });
        if (account.current !== settings.username)
          await activate(settings.username!);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [activate],
  );
  useEffect(() => {
    let active = true;
    void send<Settings>({ type: "ci:settings" })
      .then((s) => {
        if (active && s.username) void activate(s.username);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setSettingsLoaded(true);
      });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const next = changes["chessInsights.settings"]?.newValue as
        Settings | undefined;
      if (next?.username && next.username !== account.current)
        void activate(next.username);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      generation.current++;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [activate]);
  useEffect(() => {
    const listener = (message: { type?: string; username?: string }) => {
      if (
        message?.type === "ci:data-changed" &&
        message.username === account.current
      ) {
        const user = account.current,
          gen = generation.current;
        void send<Snapshot>({ type: "ci:snapshot", username: user })
          .then((next) => {
            if (gen === generation.current)
              setData((previous) =>
                previous.version >= next.version ? previous : next,
              );
          })
          .catch(() => undefined);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    const local = () => {
      const user = account.current,
        gen = generation.current;
      if (user)
        void send<Snapshot>({ type: "ci:snapshot", username: user })
          .then((next) => {
            if (gen === generation.current) setData(next);
          })
          .catch(() => undefined);
    };
    window.addEventListener("ci:refresh-local-activity", local);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      window.removeEventListener("ci:refresh-local-activity", local);
    };
  }, []);
  return { data, username, settingsLoaded, loading, error, refresh, connect };
}
export type DataState = ReturnType<typeof useData>;
