import { database, idbResult, transactionDone } from "./database";
import { getGames } from "./gameRepository";
import {
  durationFingerprint,
  parseGameDuration,
  PLAY_TIME_PARSER_VERSION,
  type GameDurationRecord,
} from "../../analysis/playTime";

export interface DurationProgress {
  processed: number;
  total: number;
  withDuration: number;
  pending: number;
  done: boolean;
}
type Listener = (progress: DurationProgress) => void;
const running = new Map<
  string,
  {
    promise: Promise<GameDurationRecord[]>;
    listeners: Set<Listener>;
    repeatRequested: boolean;
  }
>();
export async function durationSnapshot(
  username: string,
): Promise<GameDurationRecord[]> {
  const records = (await idbResult(
    (await database())
      .transaction("gameDurationAnalysis")
      .objectStore("gameDurationAnalysis")
      .index("username")
      .getAll(username),
  )) as GameDurationRecord[];
  return records.filter((r) => r.parserVersion === PLAY_TIME_PARSER_VERSION);
}
export function ensureGameDurations(
  username: string,
  onProgress?: Listener,
): Promise<GameDurationRecord[]> {
  const active = running.get(username);
  if (active) {
    if (onProgress) active.listeners.add(onProgress);
    active.repeatRequested = true;
    return active.promise;
  }
  const listeners = new Set<Listener>();
  if (onProgress) listeners.add(onProgress);
  const job = {
    promise: Promise.resolve([] as GameDurationRecord[]),
    listeners,
    repeatRequested: false,
  };
  job.promise = (async () => {
    let output: GameDurationRecord[] = [];
    let total = 0,
      withDuration = 0;
    const report = (done: boolean) => {
      const progress = {
        processed: output.length,
        total,
        withDuration,
        pending: total - output.length,
        done,
      };
      for (const listener of listeners) {
        try {
          listener(progress);
        } catch {
          /* A closed view cannot interrupt the cache job. */
        }
      }
    };
    do {
      job.repeatRequested = false;
      const [games, records] = await Promise.all([
        getGames(username),
        durationSnapshot(username),
      ]);
      const cached = new Map(records.map((r) => [r.id, r]));
      output = [];
      total = games.length;
      withDuration = 0;
      report(false);
      // Yield before work and between small batches so cached analytics can render first.
      let cursor = 0;
      while (cursor < games.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const writes: GameDurationRecord[] = [];
        const startedAt = performance.now();
        for (let batch = 0; batch < 12 && cursor < games.length; batch++) {
          const game = games[cursor++];
          const old = cached.get(game.id),
            fingerprint = durationFingerprint(game);
          const record =
            old?.fingerprint === fingerprint ? old : parseGameDuration(game);
          output.push(record);
          if (record.durationSeconds !== null) withDuration++;
          if (record !== old) writes.push(record);
          if (performance.now() - startedAt >= 16) break;
        }
        if (writes.length) {
          const tx = (await database()).transaction(
              "gameDurationAnalysis",
              "readwrite",
            ),
            done = transactionDone(tx);
          for (const record of writes)
            tx.objectStore("gameDurationAnalysis").put(record);
          await done;
        }
        report(false);
      }
      // A sync may finish while this job is parsing its original snapshot.
      // A coalesced later analyze request needs a fresh pass, not obsolete results.
    } while (job.repeatRequested);
    report(true);
    return output;
  })().finally(() => {
    if (running.get(username) === job) running.delete(username);
  });
  running.set(username, job);
  return job.promise;
}
