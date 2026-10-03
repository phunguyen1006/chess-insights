import { SETTINGS_KEY } from "../../shared/constants";
import type { Settings } from "../../shared/types";
let writes: Promise<void> = Promise.resolve();
export async function getSettings(): Promise<Settings> {
  const settings: Settings = {
    trackPuzzleActivity: true,
    ...((await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? {}),
  };
  return { ...settings, theme: settings.theme === "dark" ? "dark" : "light" };
}
export async function setSettings(settings: Settings) {
  const patch = { ...settings };
  const write = writes.then(async () => {
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { ...(await getSettings()), ...patch },
    });
  });
  writes = write.catch(() => undefined);
  await write;
}
