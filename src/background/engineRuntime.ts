import { engineAuthorization, releaseEngine } from "./engineAuthorization";
import { analysisState, put } from "../data/storage/analysisRepository";
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
    const state = await analysisState(username);
    if (state.queue)
      await put("analysisQueue", {
        ...state.queue,
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
      });
    await documentReady();
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
          await stopEngine();
          await releaseEngine(username, token);
          await put("analysisQueue", {
            ...current.queue,
            status: "error",
            error:
              "Could not initialize Stockfish within 15 seconds. Retry Engine.",
          });
        }
      })().catch(() => undefined);
    }, 15000);
    return { token };
  } catch (error) {
    const state = await analysisState(username);
    if (state.queue)
      await put("analysisQueue", {
        ...state.queue,
        status: "error",
        error: `Could not initialize Stockfish. ${String(error)}`,
      });
    await releaseEngine(username, token);
    throw error;
  }
}
export async function stopEngine() {
  try {
    await chrome.runtime.sendMessage({ type: "ci:host-stop" });
  } catch {
    /* no running host */
  }
}
export async function testEngineRuntime() {
  await documentReady();
  return chrome.runtime.sendMessage({ type: "ci:host-test" });
}
