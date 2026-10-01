import { LocalEngine, analyzeGame, storedGameReplay } from "./engine";
import {
  analysisState,
  put,
  saveEngineGame,
} from "../data/storage/analysisRepository";
import { getGames } from "../data/storage/gameRepository";
import {
  ENGINE_VERSION,
  ENGINE_NODES,
  MISTAKE_ANALYSIS_VERSION,
} from "./evaluation";
import type { Reply } from "../shared/types";
import { pgnFingerprint } from "./fingerprint";
import { completedPgn } from "./clocks";
let engine: LocalEngine | null = null,
  stopped = false;
let token = location.hash.slice(1);
let busy = false;
const release = () => {
  if (!import.meta.env.DEV)
    void chrome.runtime
      .sendMessage({ type: "ci:engine-release", token })
      .catch(() => undefined);
};
window.addEventListener("pagehide", () => {
  stopped = true;
  engine?.stop();
  release();
});
async function run() {
  let username = "";
  try {
    if (import.meta.env.DEV) {
      const entry = JSON.parse(
        localStorage.getItem(`ci-engine:${token}`) ?? "null",
      ) as { username: string; expires: number } | null;
      localStorage.removeItem(`ci-engine:${token}`);
      if (
        !entry ||
        entry.expires < Date.now() ||
        parent === window ||
        !parent.location.hash.startsWith("#chess-insights/mistakes")
      )
        throw new Error("Historical fixture authorization required.");
      username = entry.username;
    } else {
      const reply = (await chrome.runtime.sendMessage({
        type: "ci:engine-claim",
        token,
      })) as Reply<string>;
      if (!reply.ok) throw new Error(reply.error.message);
      username = reply.data;
    }
    const guard = async () => {
      if (stopped) throw new Error("Analysis paused.");
      if (import.meta.env.DEV) {
        if (!parent.location.hash.startsWith("#chess-insights/mistakes"))
          throw new Error("Historical review only.");
      } else {
        const reply = (await chrome.runtime.sendMessage({
          type: "ci:engine-guard",
          token,
        })) as Reply<boolean>;
        if (!reply.ok) {
          engine?.stop();
          throw new Error(reply.error.message);
        }
      }
    };
    await guard();
    const games = new Map((await getGames(username)).map((g) => [g.id, g]));
    const initial = await analysisState(username);
    const cached = new Map(initial.analyses.map((a) => [a.id, a]));
    let queue = initial.queue;
    if (!queue) return;
    if (
      !queue.ids.every((id) => {
        const g = games.get(id);
        return (
          g?.rules === "chess" &&
          g.endTime > 0 &&
          !!g.pgn &&
          completedPgn(g.pgn)
        );
      })
    )
      throw new Error(
        "Only completed stored standard games may start the engine.",
      );
    if (!queue.ids.length) return;
    engine = new LocalEngine(
      new URL("vendor/stockfish/stockfish-18-lite-single.js", location.href)
        .href,
    );
    queue = {
      ...queue,
      status: "initializing",
      engine: { ...engine.status },
      error: undefined,
    };
    await put("analysisQueue", queue);
    await engine.ready(async (status) => {
      const current = (await analysisState(username)).queue;
      if (current) await put("analysisQueue", { ...current, engine: status });
    });
    if (import.meta.env.DEV)
      console.debug("[Chess Insights] Engine ready", engine.status);
    queue = {
      ...queue,
      status: "running",
      engine: { ...engine.status, running: true },
      error: undefined,
    };
    await put("analysisQueue", queue);
    while (queue.ids.length && !stopped) {
      await guard();
      const game = games.get(queue.ids[0]);
      if (!game) throw new Error("Stored game is unavailable.");
      const latest = (await analysisState(username)).queue;
      if (latest?.status !== "running") return;
      queue = {
        ...queue,
        currentGame: `vs ${game.opponentUsername ?? "unknown"} · ${game.timeClass}`,
      };
      await put("analysisQueue", queue);
      const previous = cached.get(game.id),
        source = pgnFingerprint(game.pgn!);
      if (
        queue.reanalyze ||
        previous?.analysisVersion !== MISTAKE_ANALYSIS_VERSION ||
        previous?.engineVersion !== ENGINE_VERSION ||
        previous?.nodes !== ENGINE_NODES ||
        previous?.source !== source
      ) {
        let mistakes;
        try {
          const replay = storedGameReplay(game);
          if (import.meta.env.DEV)
            console.debug(
              "[Chess Insights] Stored PGN replay",
              JSON.stringify(replay),
            );
          mistakes = await analyzeGame(game, engine, guard);
        } catch (error) {
          if (engine.status.error) throw error;
          await guard();
          const current = (await analysisState(username)).queue;
          if (!current || current.status !== "running") return;
          queue = {
            ...current,
            ids: current.ids.filter((id) => id !== game.id),
            skipped: (current.skipped ?? 0) + 1,
            error: `Skipped ${game.id}: ${String(error)}`,
          };
          await put("analysisQueue", queue);
          continue;
        }
        if (stopped) return;
        await guard();
        await saveEngineGame(
          {
            id: game.id,
            username,
            analysisVersion: MISTAKE_ANALYSIS_VERSION,
            engineVersion: ENGINE_VERSION,
            nodes: ENGINE_NODES,
            analyzedAt: Date.now(),
            source: pgnFingerprint(game.pgn!),
          },
          mistakes,
        );
        if (import.meta.env.DEV)
          console.debug("[Chess Insights] Game committed", {
            gameId: game.id,
            mistakes: mistakes.length,
          });
      }
      // Re-read persisted queue so cancellation cannot re-add pending games.
      const current = (await analysisState(username)).queue;
      if (!current || !["running", "paused"].includes(current.status)) return;
      queue = {
        ...current,
        ids: current.ids.filter((id) => id !== game.id),
        completed: current.completed + 1,
      };
      await put("analysisQueue", queue);
      if (queue.status === "paused") return;
    }
    await put("analysisQueue", {
      ...queue,
      status: "idle",
      engine: { ...engine.status, running: false },
    });
  } catch (error) {
    if (username && !stopped) {
      const queue = (await analysisState(username)).queue;
      if (queue)
        await put("analysisQueue", {
          ...queue,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          engine: engine
            ? { ...engine.status, running: false, error: String(error) }
            : undefined,
        });
    }
  } finally {
    try {
      if (username && engine) {
        const current = (await analysisState(username)).queue;
        if (current)
          await put("analysisQueue", {
            ...current,
            engine: { ...engine.status, running: false },
          });
      }
    } catch (error) {
      if (import.meta.env.DEV)
        console.debug(
          "[Chess Insights] Engine cleanup storage error",
          String(error),
        );
    }
    engine?.stop();
    engine = null;
    release();
    busy = false;
  }
}
if (import.meta.env.DEV) void run();
else
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      (sender.url && sender.url !== chrome.runtime.getURL("background.js"))
    )
      return false;
    if (message.type === "ci:host-run") {
      if (busy) {
        reply({ ok: false, error: { message: "Engine is already running." } });
        return false;
      }
      busy = true;
      stopped = false;
      token = message.token;
      reply({ ok: true, data: true });
      void run();
    } else if (message.type === "ci:host-stop") {
      stopped = true;
      engine?.stop();
      reply({ ok: true, data: true });
    } else if (message.type === "ci:host-test") {
      if (busy) {
        reply({
          ok: false,
          error: { message: "Pause analysis before self-test." },
        });
        return false;
      }
      busy = true;
      void (async () => {
        let test: LocalEngine | null = null;
        try {
          test = new LocalEngine(
            chrome.runtime.getURL(
              "vendor/stockfish/stockfish-18-lite-single.js",
            ),
          );
          await test.ready();
          const result = await test.evaluate(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          );
          reply({
            ok: true,
            data: {
              success: true,
              bestMove: result.best,
              evaluation: result.score,
              engine: test.status,
            },
          });
        } catch (error) {
          reply({ ok: false, error: { message: String(error) } });
        } finally {
          test?.stop();
          busy = false;
        }
      })();
      return true;
    }
    return false;
  });
