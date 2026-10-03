import type { NormalizedGame } from "../shared/types";
import type { EngineAnalysis } from "./types";
import {
  ENGINE_NODES,
  ENGINE_VERSION,
  MISTAKE_ANALYSIS_VERSION,
} from "./evaluation";
import { pgnFingerprint } from "./fingerprint";
import { storedGameReplay } from "./engine";

// Polling progress must not replay thousands of PGNs every second. Keep only
// lightweight eligibility results; source and player changes invalidate them.
const eligibility = new Map<
  string,
  { pgn: string | null; key: string; source: string; eligible: boolean }
>();
export async function selectAnalysisGames(
  games: NormalizedGame[],
  analyses: EngineAnalysis[],
  force = false,
) {
  const cached = new Map(analyses.map((analysis) => [analysis.id, analysis]));
  const pending: string[] = [];
  let analyzed = 0,
    skipped = 0;
  let parsed = 0,
    batchStart = performance.now();
  for (const game of [...games].sort((a, b) => b.endTime - a.endTime)) {
    const key = JSON.stringify([
      game.username,
      game.rules,
      game.endTime,
      game.url,
      game.playerColor,
    ]);
    const cacheId = `${game.username}:${game.id}`;
    const replay = eligibility.get(cacheId);
    const reusable = replay?.key === key && replay.pgn === game.pgn;
    const source = reusable ? replay.source : pgnFingerprint(game.pgn ?? "");
    const previous = cached.get(game.id);
    const current =
      previous?.analysisVersion === MISTAKE_ANALYSIS_VERSION &&
      previous.engineVersion === ENGINE_VERSION &&
      previous.nodes === ENGINE_NODES &&
      previous.source === source;
    let eligible = reusable ? replay.eligible : undefined;
    if (eligible === undefined) {
      try {
        eligible = storedGameReplay(game).fenCount > 0;
      } catch {
        eligible = false;
      }
      // Archive updates deserialize new objects. Reuse unchanged PGNs by ID,
      // with a bounded cache and exact source/player invalidation.
      if (eligibility.size >= 10000 && !eligibility.has(cacheId))
        eligibility.delete(eligibility.keys().next().value!);
      eligibility.set(cacheId, { pgn: game.pgn, key, source, eligible });
      if (++parsed >= 12 || performance.now() - batchStart >= 16) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        parsed = 0;
        batchStart = performance.now();
      }
    }
    if (!eligible) {
      skipped++;
      continue;
    }
    if (current && !force) analyzed++;
    else pending.push(game.id);
  }
  return {
    pending,
    total: games.length,
    analyzed,
    skipped,
    parseable: games.length - skipped,
    withPgn: games.filter((g) => !!g.pgn).length,
  };
}
