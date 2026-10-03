import { useCallback, useEffect, useState } from "react";
import type { Settings } from "../../shared/types";
import { SETTINGS_KEY } from "../../shared/constants";
import { send } from "./client";
export type Theme = "light" | "dark";
export function useAppearance() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      changed = false;
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      const next = changes[SETTINGS_KEY]?.newValue as Settings | undefined;
      if (next) {
        changed = true;
        setTheme(next.theme === "dark" ? "dark" : "light");
        setReady(true);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    void send<Settings>({ type: "ci:settings" })
      .then((settings) => {
        if (active && !changed)
          setTheme(settings.theme === "dark" ? "dark" : "light");
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);
  const change = useCallback(async (next: Theme) => {
    setSaving(true);
    setError("");
    try {
      const settings = await send<Settings>({
        type: "ci:theme-setting",
        theme: next,
      });
      setTheme(settings.theme === "dark" ? "dark" : "light");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, []);
  return { theme, ready, saving, error, change };
}
