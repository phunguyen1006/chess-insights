import { database, idbResult, transactionDone } from "./database";
import { getGames, getUser } from "./gameRepository";
import { parsePgnClockData, TIME_PARSER_VERSION } from "../../analysis/clocks";
import {
  scheduleReview,
  MISTAKE_ANALYSIS_VERSION,
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
import { selectAnalysisGames } from "../../analysis/selection";
import type { NormalizedGame } from "../../shared/types";

const selectionGames = new Map<
  string,
  { version: number; games: NormalizedGame[] }
>();
async function cachedSelectionGames(username: string) {
  const user = await getUser(username);
  const cached = selectionGames.get(username);
  if (user && cached?.version === user.version) return cached.games;
  const games = await getGames(username);
  if (user) {
    if (selectionGames.size >= 4) selectionGames.clear();
    selectionGames.set(username, { version: user.version, games });
  }
  return games;
}
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
export async function getAnalysisQueue(
  username: string,
): Promise<Queue | null> {
  return (
    ((await idbResult(
      (await database())
        .transaction("analysisQueue")
        .objectStore("analysisQueue")
        .get(username),
    )) as Queue | undefined) ?? null
  );
}
export async function updateAnalysisQueue(
  username: string,
  update: (current: Queue) => Queue | null,
): Promise<Queue | null> {
  const tx = (await database()).transaction("analysisQueue", "readwrite");
  const done = transactionDone(tx);
  const store = tx.objectStore("analysisQueue");
  const current = (await idbResult(store.get(username))) as Queue | undefined;
  const next = current ? update(current) : null;
  if (next) store.put(next);
  await done;
  return next;
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
    const games =
        message.scope === "unanalyzed"
          ? await cachedSelectionGames(username)
          : await getGames(username),
      ids = new Set(message.ids ?? []);
    const selected =
      message.scope === "unanalyzed"
        ? games
        : games.filter((g) => ids.has(g.id));
    const selection = await selectAnalysisGames(
      selected,
      state.analyses,
      message.scope !== "unanalyzed" && message.force === true,
    );
    const pending = selection.pending;
    await put("analysisQueue", {
      id: username,
      username,
      ids: pending,
      completed: 0,
      total: pending.length,
      selected: selected.length,
      withPgn: selection.withPgn,
      parseable: selection.parseable,
      skipped: selection.skipped,
      error:
        selected.length > 0 && !selection.parseable
          ? "No eligible completed games with a valid player PGN in this selection."
          : undefined,
      status:
        selected.length > 0 && !selection.parseable
          ? "error"
          : pending.length
            ? "paused"
            : "idle",
      reanalyze: message.scope !== "unanalyzed" && message.force === true,
    } satisfies Queue);
  }
  if (action === "pause" || action === "cancel")
    await updateAnalysisQueue(username, (current) => ({
      ...current,
      ids: action === "cancel" ? [] : current.ids,
      status: action === "cancel" || !current.ids.length ? "idle" : "paused",
    }));
  if (action === "review") {
    const mistake = state.mistakes.find((m) => m.id === message.mistakeId);
    if (
      !mistake ||
      !["Again", "Hard", "Good", "Easy"].includes(message.grade ?? "")
    )
      throw new Error("Invalid review.");
    const tx = (await database()).transaction("mistakeReviews", "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("mistakeReviews");
    const previous = (await idbResult(store.get(mistake.id))) as
      Review | undefined;
    store.put(
      scheduleReview(
        mistake.id,
        username,
        message.grade!,
        message.correct === true,
        previous,
      ),
    );
    await done;
  }
  const next = await analysisState(username, message.includeClocks === true);
  if (message.includeSelection) {
    const selected = await selectAnalysisGames(
      await cachedSelectionGames(username),
      next.analyses,
    );
    next.selection = {
      total: selected.total,
      analyzed: selected.analyzed,
      pending: selected.pending.length,
      skipped: selected.skipped,
    };
  }
  return next;
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
