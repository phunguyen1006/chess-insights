import { useState, useMemo } from "react";
import type { NormalizedGame, TimeClass } from "../../../shared/types";
import { POOLS } from "../../../shared/constants";
import {
  ratingGames,
  ratingSummary,
  rollingAverage,
  observedDeltas,
  ratingDrawdown,
} from "../../../analytics/ratings";
import { Panel, Stats, Select, signed } from "../components/Common";
import { RatingCards } from "../components/RatingCards";
import { Trend } from "../components/Charts";
export function RatingPage({
  games,
  allGames,
  selectedControl = "all",
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
  selectedControl?: string;
}) {
  const [pool, setPool] = useState<TimeClass>("rapid"),
    [window, setWindow] = useState("0");
  const effectivePool = (
    selectedControl === "all" ? pool : selectedControl
  ) as TimeClass;
  const list = useMemo(
    () => ratingGames(games, effectivePool),
    [games, effectivePool],
  );
  const summary = ratingSummary(games, effectivePool),
    delta = useMemo(() => observedDeltas(allGames), [allGames]);
  const values =
    window === "0"
      ? list.map((g) => g.playerRating!)
      : rollingAverage(
          list.map((g) => g.playerRating!),
          Number(window),
        );
  return (
    <>
      <RatingCards games={games} />
      <div className="ci-filters">
        {selectedControl === "all" ? (
          <Select
            label="Rating pool"
            value={pool}
            options={[...POOLS]}
            onChange={(v) => setPool(v as TimeClass)}
          />
        ) : (
          <p className="ci-note">Rating pool: {effectivePool}</p>
        )}
        <Select
          label="Chart series"
          value={window}
          options={[
            ["0", "Raw observed rating"],
            ...["10", "20", "50", "100"].map(
              (n) => [n, `${n}-game rolling average`] as [string, string],
            ),
          ]}
          onChange={setWindow}
        />
      </div>
      <Stats
        items={[
          ["Latest observed", summary.current],
          ["Period start", summary.start],
          ["Change", signed(summary.change)],
          ["Highest observed", summary.highest],
          ["Lowest observed", summary.lowest],
          ["Rated games", summary.games],
        ]}
      />
      <Panel
        title={
          window === "0"
            ? `${effectivePool} · Observed rating`
            : `${effectivePool} · ${window}-game rolling average (Chess Insights)`
        }
      >
        <div
          className="ci-rating-chart"
          aria-label={`${effectivePool} rating history`}
        >
          <Trend
            tall
            baselineZero={false}
            label={`${effectivePool} rating history`}
            data={list.map((g, i) => ({
              label: g.localDate,
              value: values[i],
              detail: `${g.opponentUsername ?? "Unknown opponent"} · ${g.result} · observed ${g.playerRating} · observed change ${signed(delta.get(g.id))}`,
            }))}
          />
        </div>
        {window !== "0" && list.length < Number(window) && (
          <p className="ci-note">
            At least {window} games are needed for this rolling average.
          </p>
        )}
        <p className="ci-note">
          Public archives provide observed ratings, not guaranteed post-game
          ratings. Horizontal position follows completed game sequence; the axis
          labels show dates. Pools remain separate; rolling averages use all
          selected games. Large histories are sampled to at most 181 marks for
          display; each displayed observation retains its exact date, opponent
          and observed change.
        </p>
      </Panel>
      <Panel title={`${effectivePool} · Distance below selected-period peak`}>
        <Trend
          area
          label="Rating drawdown"
          data={ratingDrawdown(games, effectivePool)}
        />
        <p className="ci-note">
          Running peak within the selected period. Current distance:{" "}
          {summary.current !== null && summary.highest !== null
            ? signed(summary.current - summary.highest)
            : "—"}{" "}
          rating points.
        </p>
      </Panel>
    </>
  );
}
