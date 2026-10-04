import type { NormalizedGame, TimeClass } from "../shared/types";
import type { EngineAnalysis, Mistake } from "../analysis/types";
import {
  durationFingerprint,
  eligibleForPlayTime,
  PLAY_TIME_PARSER_VERSION,
  type GameDurationRecord,
} from "../analysis/playTime";
import { MISTAKE_ANALYSIS_VERSION } from "../analysis/evaluation";
import { POOLS } from "../shared/constants";
import { results } from "./results";
import { ratingSummary } from "./ratings";
import { playTimeSummary, type PlayTimeSummary } from "./playTime";
import type { LifeRating } from "./lifeReviewMetrics";

export const LIFE_OPENING_SAMPLE = 8;
export const LIFE_COMPARISON_SAMPLE = 10;
export interface LifeQuality {
  analyzed: number;
  games: number;
  coverage: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  blundersPerGame: number | null;
  mistakesPerGame: number | null;
  inaccuraciesPerGame: number | null;
  trend: {
    period: string;
    analyzed: number;
    blunders: number;
    mistakes: number;
    inaccuracies: number;
  }[];
}
export interface LifeGroup {
  key: string;
  label: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  /** A win earns 1 and a draw earns 0.5; expressed as a percentage. */
  score: number;
  avgOpponent: number | null;
  previousGames: number;
  previousWins: number;
  previousWinRate: number | null;
  /** Change in share of all games, expressed in percentage points. */
  usageChange: number | null;
  analyzed: number;
  blundersPerGame: number | null;
  mistakesPerGame: number | null;
  inaccuraciesPerGame: number | null;
  previousAnalyzed: number;
  previousBlundersPerGame: number | null;
  observedStart?: number | null;
  observedEnd?: number | null;
  observedChange?: number | null;
  color?: "white" | "black";
  eco?: string | null;
  name?: string;
}
export interface LifeEvidence {
  current: ReturnType<typeof results>;
  previous: ReturnType<typeof results>;
  quality: LifeQuality;
  previousQuality: LifeQuality;
  pools: LifeGroup[];
  colors: LifeGroup[];
  openings: LifeGroup[];
  opponentBins: LifeGroup[];
  opponentsWithRatings: number;
  bestFrequent: LifeGroup | null;
  worstFrequent: LifeGroup | null;
  time: PlayTimeSummary;
  previousTime: PlayTimeSummary;
}
export interface LifeInsight {
  title: string;
  detail: string;
}
export interface LifeMoment extends LifeInsight {
  date: string;
  game?: NormalizedGame;
}
export interface LifeStreaks {
  win: { games: NormalizedGame[]; length: number };
  unbeaten: { games: NormalizedGame[]; length: number };
  loss: { games: NormalizedGame[]; length: number };
}

type Counts = { blunders: number; mistakes: number; inaccuracies: number };
const zeroCounts = (): Counts => ({
  blunders: 0,
  mistakes: 0,
  inaccuracies: 0,
});
function qualityIndex(
  games: NormalizedGame[],
  analyses: EngineAnalysis[],
  mistakes: Mistake[],
) {
  const gameMap = new Map(games.map((g) => [g.id, g]));
  const counts = new Map<string, Counts>();
  for (const a of analyses) {
    const g = gameMap.get(a.id);
    if (
      g &&
      a.username === g.username &&
      a.analysisVersion === MISTAKE_ANALYSIS_VERSION
    )
      counts.set(a.id, zeroCounts());
  }
  const seen = new Set<string>();
  for (const m of mistakes) {
    const g = gameMap.get(m.gameId),
      count = counts.get(m.gameId);
    if (!g || !count || seen.has(m.id) || m.username !== g.username) continue;
    if (!m.id.endsWith(`:v${MISTAKE_ANALYSIS_VERSION}`)) continue;
    seen.add(m.id);
    if (m.severity === "blunder") count.blunders++;
    else if (m.severity === "mistake") count.mistakes++;
    else if (m.severity === "inaccuracy") count.inaccuracies++;
  }
  return counts;
}
function quality(
  games: NormalizedGame[],
  indexed: Map<string, Counts>,
): LifeQuality {
  const totals = zeroCounts(),
    periods = new Map<string, Counts & { analyzed: number }>();
  const months = games.map((g) => g.localDate.slice(0, 7)).sort();
  if (months.length) {
    const first = months[0],
      last = months.at(-1)!;
    const cursor = new Date(
      Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5)) - 1, 1),
    );
    while (true) {
      const month = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      if (month > last) break;
      // A zero denominator is unavailable evidence, not a zero error rate.
      periods.set(month, { ...zeroCounts(), analyzed: 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  let analyzed = 0;
  for (const g of games) {
    const count = indexed.get(g.id);
    if (!count) continue;
    analyzed++;
    const period = g.localDate.slice(0, 7),
      row = periods.get(period) ?? { ...zeroCounts(), analyzed: 0 };
    row.analyzed++;
    for (const key of ["blunders", "mistakes", "inaccuracies"] as const) {
      totals[key] += count[key];
      row[key] += count[key];
    }
    periods.set(period, row);
  }
  return {
    analyzed,
    games: games.length,
    coverage: games.length ? analyzed / games.length : 0,
    ...totals,
    blundersPerGame: analyzed ? totals.blunders / analyzed : null,
    mistakesPerGame: analyzed ? totals.mistakes / analyzed : null,
    inaccuraciesPerGame: analyzed ? totals.inaccuracies / analyzed : null,
    trend: [...periods]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, row]) => ({ period, ...row })),
  };
}
function keyedGames(
  games: NormalizedGame[],
  key: (g: NormalizedGame) => string | null,
) {
  const groups = new Map<string, NormalizedGame[]>();
  for (const g of games) {
    const k = key(g);
    if (k === null) continue;
    const values = groups.get(k) ?? [];
    values.push(g);
    groups.set(k, values);
  }
  return groups;
}
export function buildLifeEvidence(
  currentGames: NormalizedGame[],
  previousGames: NormalizedGame[],
  analyses: EngineAnalysis[] = [],
  mistakes: Mistake[] = [],
  durations: GameDurationRecord[] = [],
): LifeEvidence {
  const unique = (list: NormalizedGame[]) => [
    ...new Map(
      list.filter((g) => g.rules === "chess").map((g) => [g.id, g]),
    ).values(),
  ];
  const current = unique(currentGames),
    previous = unique(previousGames);
  const indexed = qualityIndex([...current, ...previous], analyses, mistakes);
  function group(
    key: string,
    label: string,
    list: NormalizedGame[],
    old: NormalizedGame[],
  ): LifeGroup {
    const summary = results(list),
      prev = results(old),
      q = quality(list, indexed),
      oldq = quality(old, indexed);
    const ratings = list.flatMap((g) =>
      typeof g.opponentRating === "number" && Number.isFinite(g.opponentRating)
        ? [g.opponentRating]
        : [],
    );
    return {
      key,
      label,
      ...summary,
      score: list.length
        ? (100 * (summary.wins + summary.draws / 2)) / list.length
        : 0,
      avgOpponent: ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null,
      previousGames: old.length,
      previousWins: prev.wins,
      previousWinRate: old.length ? prev.winRate : null,
      usageChange:
        current.length && previous.length
          ? 100 * (list.length / current.length - old.length / previous.length)
          : null,
      analyzed: q.analyzed,
      blundersPerGame: q.blundersPerGame,
      mistakesPerGame: q.mistakesPerGame,
      inaccuraciesPerGame: q.inaccuraciesPerGame,
      previousAnalyzed: oldq.analyzed,
      previousBlundersPerGame: oldq.blundersPerGame,
    };
  }
  const byPool = keyedGames(current, (g) => g.timeClass),
    oldPool = keyedGames(previous, (g) => g.timeClass);
  const pools = [
    ...POOLS,
    ...(byPool.has("unknown") || oldPool.has("unknown")
      ? ["unknown" as const]
      : []),
  ].map((pool) => {
    const list = byPool.get(pool) ?? [],
      rating = ratingSummary(list, pool as TimeClass);
    return {
      ...group(pool, pool, list, oldPool.get(pool) ?? []),
      observedStart: rating.start,
      observedEnd: rating.current,
      observedChange: rating.change,
    };
  });
  const colors = (["white", "black"] as const).map((color) => ({
    ...group(
      color,
      color,
      current.filter((g) => g.playerColor === color),
      previous.filter((g) => g.playerColor === color),
    ),
    color,
  }));
  const openingKey = (g: NormalizedGame) =>
    g.eco || g.openingName
      ? JSON.stringify([g.playerColor, g.eco, g.openingName])
      : null;
  const openingsNow = keyedGames(current, openingKey),
    openingsOld = keyedGames(previous, openingKey);
  const openings = [...new Set([...openingsNow.keys(), ...openingsOld.keys()])]
    .map((key) => {
      const list = openingsNow.get(key) ?? [],
        old = openingsOld.get(key) ?? [],
        g = list[0] ?? old[0];
      const name = g.openingName ?? `ECO ${g.eco}`;
      return {
        ...group(
          key,
          `${g.eco ? `${g.eco} · ` : ""}${name} · ${g.playerColor}`,
          list,
          old,
        ),
        name,
        eco: g.eco,
        color: g.playerColor,
      };
    })
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.previousGames - a.previousGames ||
        a.key.localeCompare(b.key),
    );
  const opponentKey = (g: NormalizedGame) => {
    if (
      g.playerRating === null ||
      g.opponentRating === null ||
      !Number.isFinite(g.playerRating) ||
      !Number.isFinite(g.opponentRating)
    )
      return null;
    const delta = g.opponentRating - g.playerRating;
    return Math.abs(delta) < 100
      ? "similar"
      : delta >= 200
        ? "higher200"
        : delta >= 100
          ? "higher100"
          : delta <= -200
            ? "lower200"
            : "lower100";
  };
  const opponentsNow = keyedGames(current, opponentKey),
    opponentsOld = keyedGames(previous, opponentKey);
  const opponentBins = [
    ["lower200", "200+ lower"],
    ["lower100", "100–199 lower"],
    ["similar", "Within 99 points"],
    ["higher100", "100–199 higher"],
    ["higher200", "200+ higher"],
  ].map(([key, label]) =>
    group(key, label, opponentsNow.get(key) ?? [], opponentsOld.get(key) ?? []),
  );
  const frequent = openings.filter((row) => row.games >= LIFE_OPENING_SAMPLE);
  return {
    current: results(current),
    previous: results(previous),
    quality: quality(current, indexed),
    previousQuality: quality(previous, indexed),
    pools,
    colors,
    openings,
    opponentBins,
    opponentsWithRatings: opponentBins.reduce((sum, row) => sum + row.games, 0),
    bestFrequent:
      [...frequent].sort(
        (a, b) =>
          b.winRate - a.winRate ||
          b.games - a.games ||
          a.key.localeCompare(b.key),
      )[0] ?? null,
    worstFrequent:
      [...frequent].sort(
        (a, b) =>
          a.winRate - b.winRate ||
          b.games - a.games ||
          a.key.localeCompare(b.key),
      )[0] ?? null,
    time: playTimeSummary(current, durations),
    previousTime: playTimeSummary(previous, durations),
  };
}

/** A conservative binomial interval avoids strong claims from tiny or noisy samples. */
export function lifeWilsonInterval(
  wins: number,
  games: number,
): [number, number] {
  if (!games) return [0, 1];
  const z = 1.96,
    p = wins / games,
    denominator = 1 + (z * z) / games;
  const midpoint = (p + (z * z) / (2 * games)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) /
    denominator;
  return [Math.max(0, midpoint - margin), Math.min(1, midpoint + margin)];
}
function meaningfulRate(
  wins: number,
  games: number,
  oldWins: number,
  oldGames: number,
  minimum: number,
) {
  if (
    games < minimum ||
    oldGames < minimum ||
    Math.abs(wins / games - oldWins / oldGames) < 0.05
  )
    return false;
  const a = lifeWilsonInterval(wins, games),
    b = lifeWilsonInterval(oldWins, oldGames);
  return a[0] > b[1] || a[1] < b[0];
}
export function generateLifeReviewInsights(
  evidence: LifeEvidence,
  rating?: LifeRating,
  pool = "selected pool",
) {
  const improved: LifeInsight[] = [],
    regressed: LifeInsight[] = [],
    notes: string[] = [];
  function rate(
    title: string,
    wins: number,
    games: number,
    oldWins: number,
    oldGames: number,
    minimum: number,
  ) {
    if (!meaningfulRate(wins, games, oldWins, oldGames, minimum)) return;
    const now = (100 * wins) / games,
      before = (100 * oldWins) / oldGames,
      delta = now - before;
    (delta > 0 ? improved : regressed).push({
      title: `${title} win rate ${delta > 0 ? "increased" : "decreased"}`,
      detail: `${before.toFixed(1)}% → ${now.toFixed(1)}% (${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp); ${oldGames} previous games, ${games} current games. The 95% binomial intervals do not overlap.`,
    });
  }
  rate(
    "Overall",
    evidence.current.wins,
    evidence.current.games,
    evidence.previous.wins,
    evidence.previous.games,
    LIFE_COMPARISON_SAMPLE,
  );
  for (const row of [
    ...evidence.pools,
    ...evidence.colors,
    ...evidence.opponentBins,
  ])
    rate(
      row.label,
      row.wins,
      row.games,
      row.previousWins,
      row.previousGames,
      LIFE_COMPARISON_SAMPLE,
    );
  for (const row of evidence.openings)
    rate(
      row.label,
      row.wins,
      row.games,
      row.previousWins,
      row.previousGames,
      LIFE_OPENING_SAMPLE,
    );
  const now = evidence.quality,
    before = evidence.previousQuality;
  if (now.analyzed >= 10 && before.analyzed >= 10) {
    for (const [name, count] of [
      ["Blunder", "blunders"],
      ["Mistake", "mistakes"],
      ["Inaccuracy", "inaccuracies"],
    ] as const) {
      const a = now[count] / now.analyzed,
        b = before[count] / before.analyzed,
        delta = a - b;
      const margin =
        1.96 *
        Math.sqrt(
          (now[count] + 1) / (now.analyzed * now.analyzed) +
            (before[count] + 1) / (before.analyzed * before.analyzed),
        );
      if (
        Math.abs(delta) < 0.25 ||
        (b > 0 && Math.abs(delta) / b < 0.2) ||
        Math.abs(delta) <= margin
      )
        continue;
      const relative =
        b > 0
          ? `; ${delta > 0 ? "+" : ""}${((100 * delta) / b).toFixed(0)}%`
          : "";
      (delta < 0 ? improved : regressed).push({
        title: `${name} frequency ${delta < 0 ? "decreased" : "increased"}`,
        detail: `${b.toFixed(2)} → ${a.toFixed(2)} per analyzed game${relative}. ${before.analyzed} previous and ${now.analyzed} current saved analyses; analysis coverage and game selection can affect this comparison.`,
      });
    }
  }
  if (!evidence.current.games)
    notes.push("No completed standard chess games in this period.");
  else if (evidence.current.games < 10 || evidence.previous.games < 10)
    notes.push(
      "Limited sample for comparisons: at least 10 games in each period are required for overall, color and pool claims.",
    );
  if (!now.analyzed)
    notes.push(
      "No saved compatible local engine analysis in this period. Engine rates are unavailable.",
    );
  else
    notes.push(
      `Engine rates cover ${now.analyzed} of ${now.games} selected games; they describe the analyzed subset only.`,
    );
  notes.push(
    "Actual Game Review accuracy is not present in this cached data. Accuracy statistics, quality correlations and evaluation-based comeback claims are unavailable.",
  );
  notes.push(
    "The rules describe observed differences, not causes. Multiple comparisons are exploratory.",
  );
  const headline =
    improved[0] ??
    regressed[0] ??
    (rating &&
    rating.points.length >= 10 &&
    rating.change !== null &&
    Math.abs(rating.change) >= 25
      ? {
          title: `Your observed ${pool} rating ${rating.change > 0 ? "rose" : "fell"} ${Math.abs(rating.change)} points`,
          detail: `${rating.start} → ${rating.end} across ${rating.points.length} rated observations. Archive ratings do not expose a guaranteed final post-game rating.`,
        }
      : {
          title: evidence.current.games
            ? "A snapshot of your chess life"
            : "Nothing to review in this period",
          detail: `${evidence.current.games} completed games · ${evidence.current.wins} wins · ${evidence.current.draws} draws · ${evidence.current.losses} losses. ${evidence.previous.games ? "No comparison met the sample and evidence thresholds." : "No previous-period games are cached for comparison."}`,
        });
  return {
    headline,
    improved: improved.slice(0, 6),
    regressed: regressed.slice(0, 6),
    notes,
  };
}

export function safeLifeGameUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" &&
      ["www.chess.com", "chess.com"].includes(parsed.hostname) &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      /^\/(?:game|analysis\/game)\/(?:live|daily)\/\d+\/?$/.test(
        parsed.pathname,
      )
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
export function buildLifeMoments(
  games: NormalizedGame[],
  duration: PlayTimeSummary,
  rating: LifeRating,
  streaks: LifeStreaks,
  records: GameDurationRecord[] = [],
) {
  const best: LifeMoment[] = [],
    tough: LifeMoment[] = [];
  const ordered = [...new Map(games.map((g) => [g.id, g])).values()].sort(
    (a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id),
  );
  const upset = ordered
    .filter(
      (g) =>
        g.result === "win" &&
        g.playerRating !== null &&
        g.opponentRating !== null &&
        g.opponentRating - g.playerRating >= 100,
    )
    .sort(
      (a, b) =>
        b.opponentRating! -
          b.playerRating! -
          (a.opponentRating! - a.playerRating!) || a.endTime - b.endTime,
    )[0];
  if (upset)
    best.push({
      date: upset.localDate,
      title: "Biggest rating upset",
      detail: `Beat ${upset.opponentUsername ?? "an opponent"} rated ${upset.opponentRating}, ${upset.opponentRating! - upset.playerRating!} points above your observed ${upset.playerRating}.`,
      game: upset,
    });
  const longest = duration.highlights.longestGame;
  if (longest)
    best.push({
      date: longest.game.localDate,
      title: "Longest recorded game",
      detail: `${Math.round(longest.record.durationSeconds! / 60)} min · ${longest.game.timeClass} vs ${longest.game.opponentUsername ?? "Unknown"}. Based on observed duration.`,
      game: longest.game,
    });
  const gameMap = new Map(ordered.map((g) => [g.id, g]));
  const fastest = records
    .flatMap((record) => {
      const game = gameMap.get(record.id);
      return game &&
        game.result === "win" &&
        eligibleForPlayTime(game) &&
        record.username === game.username &&
        record.parserVersion === PLAY_TIME_PARSER_VERSION &&
        record.fingerprint === durationFingerprint(game) &&
        record.durationSeconds !== null &&
        Number.isFinite(record.durationSeconds) &&
        record.durationSeconds > 0
        ? [{ game, record }]
        : [];
    })
    .sort(
      (a, b) =>
        a.record.durationSeconds! - b.record.durationSeconds! ||
        a.game.endTime - b.game.endTime,
    )[0];
  if (fastest)
    best.push({
      date: fastest.game.localDate,
      title: "Fastest recorded win",
      detail: `${Math.round(fastest.record.durationSeconds!)} seconds · ${fastest.game.timeClass} vs ${fastest.game.opponentUsername ?? "Unknown"}. Based on observed duration.`,
      game: fastest.game,
    });
  const days = keyedGames(ordered, (g) => g.localDate);
  const active = [...days].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )[0];
  if (rating.biggestGain && rating.biggestGain.change > 0)
    best.push({
      date: rating.biggestGain.date,
      title: "Largest observed rating gain day",
      detail: `+${rating.biggestGain.change} points between the first and last rated observation that day; the last game's post-game change is unavailable.`,
    });
  const peak = rating.points.find((p) => p.rating === rating.high);
  if (peak && rating.points.length >= 2)
    best.push({
      date: peak.date,
      title: "Period rating high",
      detail: `Highest observed rating: ${peak.rating}.`,
      game: peak.game,
    });
  if (streaks.win.length >= 3)
    best.push({
      date: streaks.win.games.at(-1)!.localDate,
      title: "Longest winning streak",
      detail: `${streaks.win.length} consecutive wins in the selected completed-game history.`,
      game: streaks.win.games.at(-1),
    });
  const rough = [...days]
    .filter(([, list]) => list.length >= 5)
    .map(([date, list]) => ({ date, ...results(list) }))
    .filter((d) => d.losses >= 3)
    .sort(
      (a, b) =>
        b.losses - a.losses ||
        a.winRate - b.winRate ||
        a.date.localeCompare(b.date),
    )[0];
  if (rough)
    tough.push({
      date: rough.date,
      title: "Day with the most losses",
      detail: `${rough.losses} losses in ${rough.games} games · ${rough.winRate.toFixed(1)}% win rate. This describes results, not your effort or skill.`,
    });
  if (rating.biggestLoss && rating.biggestLoss.change < 0)
    tough.push({
      date: rating.biggestLoss.date,
      title: "Largest observed rating loss day",
      detail: `${rating.biggestLoss.change} points between the first and last rated observation that day; the last game's post-game change is unavailable.`,
    });
  if (streaks.loss.length >= 3)
    tough.push({
      date: streaks.loss.games.at(-1)!.localDate,
      title: "Longest losing streak",
      detail: `${streaks.loss.length} consecutive losses in the selected completed-game history.`,
      game: streaks.loss.games.at(-1),
    });
  const events = [...best, ...tough];
  if (active && active[1].length >= 3)
    events.push({
      date: active[0],
      title: "Most active day",
      detail: `${active[1].length} completed games · ${results(active[1]).wins} wins.`,
    });
  let prior = rating.points[0]?.rating ?? 0;
  for (const point of rating.points.slice(1)) {
    if (
      point.rating > prior &&
      Math.floor(point.rating / 100) > Math.floor(prior / 100)
    )
      events.push({
        date: point.date,
        title: "Observed rating milestone",
        detail: `${Math.floor(point.rating / 100) * 100}+ observed rating.`,
        game: point.game,
      });
    prior = Math.max(prior, point.rating);
  }
  const uniqueEvents = [
    ...new Map(
      events.map((event) => [`${event.date}:${event.title}`, event]),
    ).values(),
  ];
  // Keep the key review moments before selecting extra milestone events.
  const timeline = uniqueEvents
    .slice(0, 10)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
    );
  return { best: best.slice(0, 6), tough: tough.slice(0, 6), timeline };
}
