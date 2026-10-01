import { engineAuthorization, releaseEngine } from "./engineAuthorization";
import {
  analysisState,
  updateAnalysisQueue,
} from "../data/storage/analysisRepository";
import type { Reply } from "../shared/types";
let creating: Promise<void> | null = null;
async function documentReady() {
  const url = chrome.runtime.getURL("engine-host.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [url],
  });
  if (contexts.length) return;
  if (!creating)
    creating = chrome.offscreen
      .createDocument({
        url: "engine-host.html",
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification:
          "Run the bundled single Stockfish WASM worker for explicitly requested completed-game analysis without depending on Chess.com frame CSP or an MV3 worker lifetime.",
      })
      .finally(() => {
        creating = null;
      });
  await creating;
}
export async function openEngine(
  username: string,
  sender: chrome.runtime.MessageSender,
) {
  const { token } = (await engineAuthorization(
    { type: "ci:engine-open", username },
    sender,
  )) as { token: string };
  try {
    const queued = await updateAnalysisQueue(username, (current) =>
      current.ids.length
        ? {
            ...current,
            status: "initializing",
            error: undefined,
            engineRunToken: token,
            engine: {
              workerCreated: false,
              wasmLoaded: false,
              uciOk: false,
              readyOk: false,
              running: false,
              error: null,
            },
          }
        : null,
    );
    if (!queued) throw new Error("No completed games are queued.");
    await documentReady();
    const beforeRun = (await analysisState(username)).queue;
    if (
      beforeRun?.engineRunToken !== token ||
      beforeRun.status !== "initializing"
    )
      throw new Error("Analysis startup was cancelled.");
    const reply = (await chrome.runtime.sendMessage({
      type: "ci:host-run",
      token,
    })) as Reply<boolean>;
    if (!reply?.ok)
      throw new Error(
        reply && !reply.ok
          ? reply.error.message
          : "Engine document did not acknowledge startup.",
      );
    setTimeout(() => {
      void (async () => {
        const current = await analysisState(username);
        if (
          current.queue?.status === "initializing" &&
          current.queue.engineRunToken === token &&
          !current.queue.engine?.readyOk
        ) {
          await stopEngine(token);
          await releaseEngine(username, token);
          await updateAnalysisQueue(username, (latest) =>
            latest.engineRunToken === token && latest.status === "initializing"
              ? {
                  ...latest,
                  status: "error",
                  error:
                    "Could not initialize Stockfish within 15 seconds. Retry Engine.",
                }
              : null,
          );
        }
      })().catch(() => undefined);
    }, 15000);
    return { token };
  } catch (error) {
    await updateAnalysisQueue(username, (current) =>
      current.engineRunToken === token && current.status === "initializing"
        ? {
            ...current,
            status: "error",
            error: `Could not initialize Stockfish. ${String(error)}`,
          }
        : null,
    );
    await releaseEngine(username, token);
    throw error;
  }
}
export async function stopEngine(token?: string) {
  try {
    await chrome.runtime.sendMessage({
      type: "ci:host-stop",
      ...(token ? { token } : {}),
    });
  } catch {
    /* no running host */
  }
}
export async function testEngineRuntime() {
  await documentReady();
  return chrome.runtime.sendMessage({ type: "ci:host-test" });
}
