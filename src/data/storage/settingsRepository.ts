import { SETTINGS_KEY } from "../../shared/constants";
import type { Settings } from "../../shared/types";
export async function getSettings(): Promise<Settings> {
  return {
    trackPuzzleActivity: true,
    ...((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {}),
  };
}
export async function setSettings(settings: Settings) {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...(await getSettings()), ...settings },
  });
}
