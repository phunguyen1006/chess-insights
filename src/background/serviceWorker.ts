import {
  getPlayerProfile,
  cleanUsername,
  ApiFailure,
} from "../data/api/chessComApi";
import { getSettings, setSettings } from "../data/storage/settingsRepository";
import { snapshot, syncYears } from "../data/sync/syncManager";
import { getUser, saveUser } from "../data/storage/gameRepository";
import type { Request, Reply } from "../shared/types";
import { validRequest } from "../shared/requestValidation";
import {
  analysisRequest,
  analysisState,
  updateAnalysisQueue,
} from "../data/storage/analysisRepository";
import {
  engineAuthorization,
  releaseEngine,
  ownsEngine,
  isEngineActive,
} from "./engineAuthorization";
import { openEngine, stopEngine, testEngineRuntime } from "./engineRuntime";
import { getGames } from "../data/storage/gameRepository";
import { storedGameReplay } from "../analysis/engine";
import { historicalInsightsUrl } from "../analysis/safety";
import {
  durationSnapshot,
  ensureGameDurations,
  type DurationProgress,
} from "../data/storage/durationRepository";
import {
  puzzleSnapshot,
  startPuzzleTracking,
  savePuzzleAttempt,
  clearPuzzleHistory,
} from "../data/storage/puzzleRepository";
import {
  exportPuzzleBackup,
  importPuzzleBackup,
} from "../data/storage/puzzleBackupRepository";
function invalidRequestMessage(message: unknown) {
  const type =
    message && typeof message === "object" && "type" in message
      ? message.type
      : "";
  return type === "ci:theme-setting"
    ? "Invalid appearance theme."
    : type === "ci:durations"
      ? "Invalid duration action."
      : type === "ci:sync"
        ? "Invalid sync period."
        : "Invalid extension request.";
}
async function notifyPuzzleChange(username: string) {
  // An event token wakes all open content scripts without tabs permission or polling.
  await chrome.storage.local.set({
    "chessInsights.puzzleChange": { username, token: crypto.randomUUID() },
  });
}
let puzzleMutations: Promise<unknown> = Promise.resolve();
function mutatePuzzles(
  action: () => Promise<Reply<unknown>>,
): Promise<Reply<unknown>> {
  const next = puzzleMutations.then(action, action);
  puzzleMutations = next.catch(() => undefined);
  return next;
}
export async function handleMessage(
  message: Request,
  onProgress?: () => void,
  onDurationProgress?: (progress: DurationProgress) => void,
): Promise<Reply<unknown>> {
  try {
    if (!validRequest(message))
      throw new ApiFailure("INVALID_REQUEST", invalidRequestMessage(message));
    switch (message.type) {
      case "ci:durations":
        if (!["cache", "analyze"].includes(message.action))
          throw new ApiFailure("INVALID_REQUEST", "Invalid duration action.");
        return {
          ok: true,
          data:
            message.action === "cache"
              ? await durationSnapshot(cleanUsername(message.username))
              : await ensureGameDurations(
                  cleanUsername(message.username),
                  onDurationProgress,
                ),
        };
      case "ci:puzzle-export":
        return await mutatePuzzles(async () => ({
          ok: true,
          data: await exportPuzzleBackup(cleanUsername(message.username)),
        }));
      case "ci:puzzle-import":
        return await mutatePuzzles(async () => {
          const username = cleanUsername(message.username);
          const data = await importPuzzleBackup(username, message.text);
          await notifyPuzzleChange(username);
          return { ok: true, data };
        });
      case "ci:puzzles":
        return {
          ok: true,
          data: await puzzleSnapshot(cleanUsername(message.username)),
        };
      case "ci:puzzle-start": {
        return await mutatePuzzles(async () => {
          if (!(await getSettings()).trackPuzzleActivity)
            return { ok: true, data: null };
          const username = cleanUsername(message.username);
          const previous = (await puzzleSnapshot(username)).tracking;
          const data = await startPuzzleTracking(username);
          if (!previous) await notifyPuzzleChange(username);
          return { ok: true, data };
        });
      }
      case "ci:puzzle-save": {
        return await mutatePuzzles(async () => {
          if (!(await getSettings()).trackPuzzleActivity)
            return { ok: true, data: false };
          const username = cleanUsername(message.attempt.username);
          const saved = await savePuzzleAttempt({
            ...message.attempt,
            username,
          });
          await notifyPuzzleChange(username);
          return { ok: true, data: saved };
        });
      }
      case "ci:puzzle-setting": {
        return await mutatePuzzles(async () => {
          await setSettings({ trackPuzzleActivity: message.enabled });
          return { ok: true, data: await getSettings() };
        });
      }
      case "ci:puzzle-clear": {
        return await mutatePuzzles(async () => {
          const username = cleanUsername(message.username);
          await clearPuzzleHistory(username);
          if ((await getSettings()).trackPuzzleActivity)
            await startPuzzleTracking(username);
          await notifyPuzzleChange(username);
          return { ok: true, data: true };
        });
      }
      case "ci:analysis": {
        if (
          message.action === "pause" &&
          !(await isEngineActive(cleanUsername(message.username)))
        ) {
          await updateAnalysisQueue(
            cleanUsername(message.username),
            (current) =>
              current.engine
                ? { ...current, engine: { ...current.engine, running: false } }
                : null,
          );
        }
        if (message.action === "cancel") {
          const username = cleanUsername(message.username);
          const queue = (await analysisState(username)).queue;
          if (await isEngineActive(username))
            await stopEngine(queue?.engineRunToken);
          await releaseEngine(username, queue?.engineRunToken);
        }
        return {
          ok: true,
          data: await analysisRequest({
            ...message,
            username: cleanUsername(message.username),
          }),
        };
      }
      case "ci:settings":
        return { ok: true, data: await getSettings() };
      case "ci:theme-setting":
        if (!["light", "dark"].includes(message.theme))
          throw new ApiFailure("INVALID_REQUEST", "Invalid appearance theme.");
        await setSettings({ theme: message.theme });
        return { ok: true, data: await getSettings() };
      case "ci:connect": {
        const profile = await getPlayerProfile(cleanUsername(message.username));
        const username = cleanUsername(profile.username as string);
        await setSettings({ username });
        const user = (await getUser(username)) ?? {
          username,
          archives: [],
          indexFetchedAt: 0,
          lastSync: 0,
          version: 0,
        };
        await saveUser({ ...user, profile });
        return { ok: true, data: { username } };
      }
      case "ci:snapshot":
        return {
          ok: true,
          data: await snapshot(cleanUsername(message.username)),
        };
      case "ci:sync": {
        if (
          !Array.isArray(message.years) ||
          message.years.length > 30 ||
          !message.years.every(
            (y) =>
              Number.isInteger(y) &&
              y >= 2000 &&
              y <= new Date().getFullYear() + 1,
          )
        )
          throw new ApiFailure("INVALID_REQUEST", "Invalid sync period.");
        await syncYears(
          message.username,
          message.years,
          message.force,
          onProgress,
        );
        return {
          ok: true,
          data: await snapshot(cleanUsername(message.username)),
        };
      }
      default:
        throw new ApiFailure("INVALID_REQUEST", "Unsupported request.");
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: error instanceof ApiFailure ? error.code : "STORAGE",
        message:
          error instanceof Error ? error.message : "Unable to load local data.",
      },
    };
  }
}
chrome.runtime.onMessage.addListener((message: Request, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !message ||
    typeof message.type !== "string" ||
    !message.type.startsWith("ci:")
  )
    return false;
  if (message.type.startsWith("ci:host-")) return false;
  if (!validRequest(message)) {
    reply({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: invalidRequestMessage(message),
      },
    });
    return false;
  }
  const notify = () => {
    if (sender.tab?.id !== undefined && "username" in message)
      void chrome.tabs
        .sendMessage(sender.tab.id, {
          type: "ci:data-changed",
          username: message.username,
        })
        .catch(() => undefined);
  };
  if (
    message.type === "ci:engine-open" ||
    message.type === "ci:engine-stop" ||
    message.type === "ci:engine-status" ||
    message.type === "ci:engine-test" ||
    message.type === "ci:replay-test" ||
    message.type === "ci:engine-release" ||
    message.type === "ci:engine-claim" ||
    message.type === "ci:engine-guard"
  ) {
    void (async () => {
      try {
        if (message.type === "ci:engine-open")
          reply({ ok: true, data: await openEngine(message.username, sender) });
        else if (
          [
            "ci:engine-stop",
            "ci:engine-status",
            "ci:engine-test",
            "ci:replay-test",
          ].includes(message.type)
        ) {
          if (message.type === "ci:engine-stop") {
            if (
              sender.tab?.id !== undefined &&
              (await ownsEngine(sender.tab.id, message.username))
            ) {
              await stopEngine();
              await releaseEngine(message.username);
            }
            reply({ ok: true, data: true });
            return;
          }
          if (
            sender.tab?.id === undefined ||
            !historicalInsightsUrl(
              (await chrome.tabs.get(sender.tab.id)).url ?? "",
            )
          )
            throw new Error("Historical Mistakes page required.");
          if (message.type === "ci:engine-status")
            reply({
              ok: true,
              data: { active: await isEngineActive(message.username) },
            });
          else if (message.type === "ci:engine-test")
            reply(await testEngineRuntime());
          else if (message.type === "ci:replay-test") {
            const game = (await getGames(message.username))
              .sort((a, b) => b.endTime - a.endTime)
              .find((g) => g.pgn && g.endTime > 0 && g.rules === "chess");
            if (!game) throw new Error("No completed stored game available.");
            reply({ ok: true, data: storedGameReplay(game) });
          }
        } else
          reply({
            ok: true,
            data: await engineAuthorization(
              message as Parameters<typeof engineAuthorization>[0],
              sender,
            ),
          });
      } catch (error) {
        reply({
          ok: false,
          error: { code: "ENGINE_GUARD", message: String(error) },
        });
      }
    })();
    return true;
  }
  const durationNotify = (progress: DurationProgress) => {
    if (sender.tab?.id !== undefined && "username" in message)
      void chrome.tabs
        .sendMessage(sender.tab.id, {
          type: "ci:duration-progress",
          username: message.username,
          progress,
        })
        .catch(() => undefined);
  };
  void handleMessage(message, notify, durationNotify).then(reply);
  return true;
});
