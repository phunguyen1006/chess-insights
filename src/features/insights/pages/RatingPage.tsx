import { useState, useMemo } from "react";
import type { NormalizedGame, TimeClass } from "../../../shared/types";
import { POOLS } from "../../../shared/constants";
import { displayDate } from "../../../shared/dates";
import {
  ratingGames,
  ratingSummary,
  rollingAverage,
  observedDeltas,
  ratingDrawdown,
} from "../../../analytics/ratings";
import { Panel, Select, number, signed } from "../components/Common";
import {
  ChessSection,
  ChessSectionRow,
  PoolIcon,
  SegmentedControl,
  StatSummaryRow,
  ratingDelta,
  percentage,
} from "../components/NativeStats";
import { RatingCards } from "../components/RatingCards";
import { Trend } from "../components/Charts";

function ratingHighlights(
  games: NormalizedGame[],
  deltas: Map<string, number>,
) {
  let highest: NormalizedGame | null = null,
    bestWin: NormalizedGame | null = null,
    strongestOpponent: NormalizedGame | null = null,
    streak = 0,
    bestStreak = 0;
  const days = new Map<string, number>();
  for (const game of games) {
    if (
      game.opponentRating !== null &&
      (strongestOpponent === null ||
        game.opponentRating > strongestOpponent.opponentRating!)
    )
      strongestOpponent = game;
    if (
      game.playerRating !== null &&
      (highest === null || game.playerRating >= highest.playerRating!)
    )
      highest = game;
    if (game.result === "win") {
      bestStreak = Math.max(bestStreak, ++streak);
      if (
        game.opponentRating !== null &&
        (bestWin === null || game.opponentRating > bestWin.opponentRating!)
      )
        bestWin = game;
    } else streak = 0;
    const delta = deltas.get(game.id);
    if (delta !== undefined)
      days.set(game.localDate, (days.get(game.localDate) ?? 0) + delta);
  }
  const bestDay = [...days]
    .filter(([, change]) => change > 0)
    .sort(([dateA, a], [dateB, b]) => b - a || dateB.localeCompare(dateA))[0];
  return { highest, bestWin, strongestOpponent, bestStreak, bestDay };
}

function opponentAverage(games: NormalizedGame[]) {
  const known = games.flatMap((game) =>
    game.opponentRating === null ? [] : [game.opponentRating],
  );
  return {
    value: known.length
      ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
      : null,
    coverage: `${number(known.length)} / ${number(games.length)} with rating`,
  };
}

export function RatingPage({
  games,
  allGames,
  selectedControl = "all",
  color,
  onColorChange,
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
  selectedControl?: string;
  color?: string;
  onColorChange?: (color: string) => void;
}) {
  const [pool, setPool] = useState<TimeClass>("rapid"),
    [window, setWindow] = useState("0"),
    [localColor, setLocalColor] = useState("all");
  const selectedColor = color ?? localColor;
  const effectivePool = (
    selectedControl === "all" ? pool : selectedControl
  ) as TimeClass;
  const selectedGames = useMemo(
      () =>
        selectedColor === "all"
          ? games
          : games.filter((game) => game.playerColor === selectedColor),
      [games, selectedColor],
    ),
    list = useMemo(
      () => ratingGames(selectedGames, effectivePool),
      [selectedGames, effectivePool],
    ),
    delta = useMemo(() => observedDeltas(allGames), [allGames]),
    summary = ratingSummary(selectedGames, effectivePool),
    highlights = ratingHighlights(list, delta),
    wins = list.filter((game) => game.result === "win").length,
    draws = list.filter((game) => game.result === "draw").length,
    losses = list.length - wins - draws;
  const poolName = effectivePool[0].toUpperCase() + effectivePool.slice(1),
    values =
      window === "0"
        ? list.map((game) => game.playerRating!)
        : rollingAverage(
            list.map((game) => game.playerRating!),
            Number(window),
          );
  const resultShare = (count: number) =>
    percentage(list.length ? (100 * count) / list.length : null);
  return (
    <>
      <section
        className="ci-rating-hero"
        aria-label={`${poolName} rating statistics`}
      >
        <header className="ci-rating-header">
          <h2>
            <PoolIcon pool={effectivePool} /> {poolName}
          </h2>
          <div className="ci-rating-value">
            <strong title="Latest observed rating in the selected period">
              {number(summary.current)}
            </strong>{" "}
            <span
              className={
                summary.change === null || summary.change === 0
                  ? "ci-neutral"
                  : summary.change > 0
                    ? "ci-positive"
                    : "ci-negative"
              }
            >
              {ratingDelta(summary.change)}
            </span>
          </div>
        </header>
        {selectedControl === "all" && (
          <div className="ci-rating-pool-control">
            <Select
              label="Rating pool"
              value={pool}
              options={POOLS.map((value) => [
                value,
                value[0].toUpperCase() + value.slice(1),
              ])}
              onChange={(value) => setPool(value as TimeClass)}
            />
          </div>
        )}
        <div
          className="ci-rating-chart"
          aria-label={`${effectivePool} rating history`}
        >
          {window !== "0" && (
            <p className="ci-note">{window}-game rolling average</p>
          )}
          <Trend
            area
            tall
            baselineZero={false}
            label={`${effectivePool} rating history`}
            data={list.map((game, index) => ({
              label: game.localDate,
              value: values[index],
              detail: `${game.opponentUsername ?? "Unknown opponent"} · ${game.result} · observed ${game.playerRating} · observed change ${signed(delta.get(game.id))}`,
            }))}
          />
        </div>
        {window !== "0" && list.length < Number(window) && (
          <p className="ci-note">
            At least {window} games are needed for this rolling average.
          </p>
        )}
        <div className="ci-rating-summary">
          <StatSummaryRow
            items={[
              ["Highest Rating", summary.highest],
              ["Rated Games", summary.games],
              [
                "Period Change",
                <span
                  className={
                    summary.change === null || summary.change === 0
                      ? "ci-neutral"
                      : summary.change > 0
                        ? "ci-positive"
                        : "ci-negative"
                  }
                >
                  {ratingDelta(summary.change)}
                </span>,
              ],
            ]}
          />
        </div>
        <div className="ci-rating-controls">
          <SegmentedControl
            label="Rating color"
            value={selectedColor}
            options={[
              ["all", "All Games"],
              ["white", "White"],
              ["black", "Black"],
            ]}
            onChange={onColorChange ?? setLocalColor}
          />
        </div>
        <StatSummaryRow
          items={[
            ["Games", list.length],
            ["Wins", wins, resultShare(wins)],
            ["Draws", draws, resultShare(draws)],
            ["Losses", losses, resultShare(losses)],
          ]}
        />
      </section>
      <ChessSection title="Highlights">
        <ChessSectionRow
          label="Highest Rating"
          detail={
            highlights.highest
              ? displayDate(highlights.highest.localDate)
              : undefined
          }
          value={number(highlights.highest?.playerRating)}
          href={highlights.highest?.url || undefined}
        />
        <ChessSectionRow
          label="Best Win"
          detail={highlights.bestWin?.opponentUsername ?? undefined}
          value={number(highlights.bestWin?.opponentRating)}
          href={highlights.bestWin?.url || undefined}
        />
        <ChessSectionRow
          label="Best Win Streak"
          value={list.length ? number(highlights.bestStreak) : "—"}
        />
        <ChessSectionRow
          label="Strongest Opponent Faced"
          detail={highlights.strongestOpponent?.opponentUsername ?? undefined}
          value={number(highlights.strongestOpponent?.opponentRating)}
          href={highlights.strongestOpponent?.url || undefined}
        />
        <ChessSectionRow
          label="Biggest Observed Rating Gain Day"
          detail={
            highlights.bestDay ? displayDate(highlights.bestDay[0]) : undefined
          }
          value={
            <span className={highlights.bestDay ? "ci-positive" : "ci-neutral"}>
              {ratingDelta(highlights.bestDay?.[1] ?? null)}
            </span>
          }
        />
      </ChessSection>
      <ChessSection title="Average Opponent Rating">
        {(
          [
            ["All Games", list],
            ["When you win", list.filter((game) => game.result === "win")],
            ["When you draw", list.filter((game) => game.result === "draw")],
            ["When you lose", list.filter((game) => game.result === "loss")],
          ] as [string, NormalizedGame[]][]
        ).map(([label, subset]) => {
          const average = opponentAverage(subset);
          return (
            <ChessSectionRow
              key={label}
              label={label}
              value={number(average.value)}
              detail={average.coverage}
            />
          );
        })}
      </ChessSection>
      <details className="ci-rating-details">
        <summary>More rating details</summary>
        <div className="ci-filters">
          <Select
            label="Chart series"
            value={window}
            options={[
              ["0", "Raw observed rating"],
              ...["10", "20", "50", "100"].map(
                (value) =>
                  [value, `${value}-game rolling average`] as [string, string],
              ),
            ]}
            onChange={setWindow}
          />
        </div>
        <StatSummaryRow
          items={[
            ["Period start", summary.start],
            ["Lowest observed", summary.lowest],
          ]}
        />
        <Panel title={`${poolName} · Distance below selected-period peak`}>
          <Trend
            area
            label="Rating drawdown"
            data={ratingDrawdown(selectedGames, effectivePool)}
          />
          <p className="ci-note">
            Running peak within the selected period. Current distance:{" "}
            {summary.current !== null && summary.highest !== null
              ? signed(summary.current - summary.highest)
              : "—"}{" "}
            rating points.
          </p>
        </Panel>
        <RatingCards games={games} />
        <p className="ci-note">
          Public archives provide observed ratings, not guaranteed post-game
          ratings. Rating changes compare consecutive observations in the same
          pool across cached history. Color and period filters select which
          observations are shown; gains do not estimate the result of each game.
          The graph follows completed game sequence with dates on the axis.
          Large histories are sampled to at most 181 observations for display.
          Rolling averages use every selected observation, then the graph is
          sampled.
        </p>
      </details>
    </>
  );
}
