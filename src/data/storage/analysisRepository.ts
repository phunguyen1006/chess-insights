import { database, idbResult, transactionDone } from "./database";
import { getGames } from "./gameRepository";
import {
  parsePgnClockData,
  TIME_PARSER_VERSION,
  completedPgn,
} from "../../analysis/clocks";
import {
  scheduleReview,
  MISTAKE_ANALYSIS_VERSION,
  ENGINE_VERSION,
  ENGINE_NODES,
} from "../../analysis/evaluation";
import type {
  AnalysisState,
  ClockAnalysis,
  EngineAnalysis,
  Mistake,
  Queue,
  Review,
} from "../../analysis/types";
import type { Request } from "../../shared/types";
import { pgnFingerprint } from "../../analysis/fingerprint";
import { storedGameReplay } from "../../analysis/engine";
export async function records<T>(
  store: string,
  username: string,
): Promise<T[]> {
  return idbResult(
    (await database())
      .transaction(store)
      .objectStore(store)
      .index("username")
      .getAll(username),
  );
}
export async function put(store: string, value: unknown) {
  const tx = (await database()).transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await transactionDone(tx);
}
export async function analysisState(
  username: string,
  includeClocks = false,
): Promise<AnalysisState> {
  const [clocks, analyses, mistakes, reviews, queues] = await Promise.all([
    includeClocks
      ? records<ClockAnalysis>("moveTimeAnalysis", username)
      : Promise.resolve([] as ClockAnalysis[]),
    records<EngineAnalysis>("engineAnalysis", username),
    records<Mistake>("mistakes", username),
    records<Review>("mistakeReviews", username),
    records<Queue>("analysisQueue", username),
  ]);
  const compatible = analyses.filter(
    (a) => a.analysisVersion === MISTAKE_ANALYSIS_VERSION,
  );
  const ids = new Set(compatible.map((a) => a.id));
  return {
    clocks: clocks.filter((c) => c.parserVersion === TIME_PARSER_VERSION),
    analyses: compatible,
    mistakes: mistakes.filter(
      (m) =>
        ids.has(m.gameId) && m.id.endsWith(`:v${MISTAKE_ANALYSIS_VERSION}`),
    ),
    reviews,
    queue: queues[0] ?? null,
  };
}
export async function analyzeClocks(username: string, ids: string[]) {
  const games = (await getGames(username)).filter((g) => ids.includes(g.id));
  const cached = new Map(
    (await records<ClockAnalysis>("moveTimeAnalysis", username)).map((c) => [
      c.id,
      c,
    ]),
  );
  for (const g of games) {
    const source = pgnFingerprint(g.pgn ?? "");
    if (
      cached.get(g.id)?.source === source &&
      cached.get(g.id)?.parserVersion === TIME_PARSER_VERSION
    )
      continue;
    const parsed =
      g.timeClass === "daily"
        ? parsePgnClockData("", "")
        : parsePgnClockData(g.pgn ?? "", g.timeControl);
    await put("moveTimeAnalysis", {
      ...parsed,
      id: g.id,
      username,
      parserVersion: TIME_PARSER_VERSION,
      source,
    });
  }
  return analysisState(username, true);
}
export async function analysisRequest(
  message: Extract<Request, { type: "ci:analysis" }>,
) {
  const { username, action } = message;
  if (action === "clocks") return analyzeClocks(username, message.ids ?? []);
  const state = await analysisState(username, message.includeClocks === true);
  if (action === "enqueue") {
    if (["running", "initializing"].includes(state.queue?.status ?? ""))
      throw new Error(
        "Analysis is already running. Pause before changing the queue.",
      );
    const games = await getGames(username),
      ids = new Set(message.ids ?? []);
    const cached = new Map(state.analyses.map((a) => [a.id, a]));
    const selected = games.filter((g) => ids.has(g.id));
    const eligible = selected.filter((g) => {
      try {
        storedGameReplay(g);
        return true;
      } catch (error) {
        if (import.meta.env.DEV)
          console.debug("[Chess Insights] PGN skipped", String(error));
        return false;
      }
    });
    const pending = eligible
      .filter(
        (g) =>
          ids.has(g.id) &&
          !!g.pgn &&
          completedPgn(g.pgn) &&
          (message.force === true ||
            cached.get(g.id)?.analysisVersion !== MISTAKE_ANALYSIS_VERSION ||
            cached.get(g.id)?.source !== pgnFingerprint(g.pgn) ||
            cached.get(g.id)?.engineVersion !== ENGINE_VERSION ||
            cached.get(g.id)?.nodes !== ENGINE_NODES),
      )
      .sort((a, b) => b.endTime - a.endTime)
      .map((g) => g.id);
    await put("analysisQueue", {
      id: username,
      username,
      ids: pending,
      completed: 0,
      total: pending.length,
      selected: selected.length,
      withPgn: selected.filter((g) => !!g.pgn).length,
      parseable: eligible.length,
      skipped: selected.length - eligible.length,
      error: !eligible.length
        ? "No eligible completed games with a valid player PGN in this selection."
        : undefined,
      status: !eligible.length ? "error" : pending.length ? "paused" : "idle",
      reanalyze: message.force === true,
    } satisfies Queue);
  }
  if ((action === "pause" || action === "cancel") && state.queue)
    await put("analysisQueue", {
      ...state.queue,
      ids: action === "cancel" ? [] : state.queue.ids,
      status:
        action === "cancel" || !state.queue.ids.length ? "idle" : "paused",
    });
  if (action === "review") {
    const mistake = state.mistakes.find((m) => m.id === message.mistakeId);
    if (
      !mistake ||
      !["Again", "Hard", "Good", "Easy"].includes(message.grade ?? "")
    )
      throw new Error("Invalid review.");
    await put(
      "mistakeReviews",
      scheduleReview(
        mistake.id,
        username,
        message.grade!,
        message.correct === true,
        state.reviews.find((r) => r.id === mistake.id),
      ),
    );
  }
  return analysisState(username, message.includeClocks === true);
}
export async function saveEngineGame(
  analysis: EngineAnalysis,
  mistakes: Mistake[],
) {
  const db = await database(),
    tx = db.transaction(["engineAnalysis", "mistakes"], "readwrite");
  const old = (await idbResult(
    tx.objectStore("mistakes").index("username").getAll(analysis.username),
  )) as Mistake[];
  for (const m of old)
    if (m.gameId === analysis.id) tx.objectStore("mistakes").delete(m.id);
  tx.objectStore("engineAnalysis").put(analysis);
  for (const m of mistakes) tx.objectStore("mistakes").put(m);
  await transactionDone(tx);
}
