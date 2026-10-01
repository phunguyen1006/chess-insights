import { database, idbResult, transactionDone } from "./database";
import { localDate } from "../../shared/dates";
import type {
  PuzzleAttempt,
  PuzzleSnapshot,
  PuzzleTrackingState,
} from "../../shared/types";

export async function puzzleSnapshot(
  username: string,
): Promise<PuzzleSnapshot> {
  const tx = (await database()).transaction(
    ["puzzleAttempts", "puzzleTrackingState"],
    "readonly",
  );
  const [attempts, tracking] = await Promise.all([
    idbResult(
      tx.objectStore("puzzleAttempts").index("username").getAll(username),
    ) as Promise<PuzzleAttempt[]>,
    idbResult(tx.objectStore("puzzleTrackingState").get(username)) as Promise<
      PuzzleTrackingState | undefined
    >,
  ]);
  return {
    attempts: attempts.sort((a, b) => a.attemptedAt - b.attemptedAt),
    tracking: tracking ?? null,
  };
}
export async function startPuzzleTracking(username: string, now = Date.now()) {
  const tx = (await database()).transaction("puzzleTrackingState", "readwrite"),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleTrackingState");
  const previous = (await idbResult(store.get(username))) as
    PuzzleTrackingState | undefined;
  const state = previous ?? {
    username,
    puzzleTrackingStartedAt: now,
    puzzleTrackingStartedLocalDate: localDate(new Date(now)),
    revision: 0,
  };
  if (!previous) store.add(state);
  await done;
  return state;
}
export async function savePuzzleAttempt(attempt: PuzzleAttempt) {
  if (
    !attempt.username ||
    !attempt.id ||
    !Number.isFinite(attempt.attemptedAt) ||
    attempt.attemptedAt <= 0 ||
    attempt.attemptedAt > Date.now() + 60000 ||
    !["solved", "failed", "unknown"].includes(attempt.result)
  )
    throw new Error("Invalid puzzle attempt");
  const tx = (await database()).transaction(
      ["puzzleAttempts", "puzzleTrackingState"],
      "readwrite",
    ),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleAttempts"),
    states = tx.objectStore("puzzleTrackingState");
  const [previous, state] = await Promise.all([
    idbResult(store.get(attempt.id)),
    idbResult(states.get(attempt.username)) as Promise<
      PuzzleTrackingState | undefined
    >,
  ]);
  if (!state) {
    tx.abort();
    await done.catch(() => undefined);
    throw new Error("Puzzle tracking has not started");
  }
  if (!previous) {
    store.add({
      ...attempt,
      localDate: localDate(new Date(attempt.attemptedAt)),
      source: "live_tracker",
      createdAt: Date.now(),
    });
    states.put({ ...state, revision: state.revision + 1 });
  }
  await done;
  return !previous;
}
// Only puzzle stores are touched; game, analysis and review caches survive.
export async function clearPuzzleHistory(username: string) {
  const tx = (await database()).transaction(
      ["puzzleAttempts", "puzzleTrackingState"],
      "readwrite",
    ),
    done = transactionDone(tx);
  const store = tx.objectStore("puzzleAttempts");
  const keys = await idbResult(store.index("username").getAllKeys(username));
  keys.forEach((key) => store.delete(key));
  tx.objectStore("puzzleTrackingState").delete(username);
  await done;
}
