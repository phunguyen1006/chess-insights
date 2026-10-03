import { useMemo, useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import {
  aggregateOpponents,
  opponentInsights,
} from "../../../analytics/opponents";
import { aggregateOpenings } from "../../../analytics/openings";
import { MIN_OPPONENT_SAMPLE, POOLS } from "../../../shared/constants";
import { displayDate } from "../../../shared/dates";
import {
  Panel,
  GameList,
  number,
  signed,
  Empty,
  Bars,
} from "../components/Common";
import { Stacked, Scatter } from "../components/Charts";
import { opponentBuckets } from "../../../analytics/visuals";
import {
  ChessSection,
  ChessSectionRow,
  StatSummaryRow,
  WdlBar,
  percentage,
} from "../components/NativeStats";

export function OpponentsPage({
  games,
  allGames,
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
}) {
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(50);
  const rows = useMemo(() => aggregateOpponents(games), [games]),
    insights = useMemo(() => opponentInsights(games), [games]),
    detail = rows.find((row) => row.name === selected),
    list = games.filter(
      (game) => game.opponentUsername?.toLowerCase() === selected,
    ),
    visible = rows.filter((row) =>
      row.name.includes(search.trim().toLowerCase()),
    );
  return (
    <>
      <h2>Opponents</h2>
      <p className="ci-muted">
        Your completed games, opponent ratings, and head-to-head results.
      </p>
      <StatSummaryRow
        items={[
          ["Games", games.length],
          ["Opponents", rows.length],
          [
            "Repeat Matchups",
            rows.filter((row) => row.games >= MIN_OPPONENT_SAMPLE).length,
            MIN_OPPONENT_SAMPLE + " or more games",
          ],
        ]}
      />
      <ChessSection title="Head-to-head Opponents">
        <label
          className="ci-field"
          style={{ margin: "12px 13px", maxWidth: 320 }}
        >
          Find an opponent
          <input
            type="search"
            aria-label="Find an opponent"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(50);
            }}
            placeholder="Username"
          />
        </label>
        {visible.length ? (
          <div className="ci-table-scroll">
            <table className="ci-table">
              <thead>
                <tr>
                  {[
                    "Opponent",
                    "Games",
                    "W / D / L",
                    "Win %",
                    "Average Rating",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((row) => (
                  <tr key={row.name}>
                    <td>
                      <button
                        type="button"
                        className="ci-link-button"
                        aria-pressed={selected === row.name}
                        onClick={() => setSelected(row.name)}
                      >
                        {row.name}
                      </button>
                    </td>
                    <td>{number(row.games)}</td>
                    <td>
                      <span className="ci-positive">{number(row.wins)}</span> /{" "}
                      <span className="ci-neutral">{number(row.draws)}</span> /{" "}
                      <span className="ci-negative">{number(row.losses)}</span>
                    </td>
                    <td>{percentage(row.winRate)}</td>
                    <td>{number(row.averageRating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            {rows.length
              ? "No opponents match this search."
              : "No opponent names are available for the selected games."}
          </Empty>
        )}
        {visible.length > limit && (
          <button type="button" onClick={() => setLimit((value) => value + 50)}>
            Show More Opponents
          </button>
        )}
        <p className="ci-note" style={{ margin: "10px 13px" }}>
          Select an opponent to see completed games. Head-to-head rankings
          require {MIN_OPPONENT_SAMPLE} games. Ratings are observed archive
          values; filter by time control to compare a single pool.
        </p>
      </ChessSection>
      {detail && (
        <Panel title={"Games vs " + selected}>
          <StatSummaryRow
            items={[
              ["Games", detail.games],
              ["Wins", detail.wins, percentage(detail.winRate)],
              ["Draws", detail.draws],
              ["Losses", detail.losses],
            ]}
          />
          <WdlBar
            wins={detail.wins}
            draws={detail.draws}
            losses={detail.losses}
            label={"Results vs " + selected}
          />
          <ChessSectionRow
            label="Average Rating Difference"
            value={signed(detail.averageDifference)}
            detail="Your observed rating minus opponent rating"
          />
          <p className="ci-note">
            {POOLS.map(
              (pool) =>
                pool +
                ": " +
                list.filter((game) => game.timeClass === pool).length,
            ).join(" · ")}
          </p>
          <p className="ci-note">
            Openings:{" "}
            {aggregateOpenings(list)
              .slice(0, 5)
              .map((opening) => opening.name + " (" + opening.games + ")")
              .join(" · ") || "No opening tags"}
          </p>
          <GameList games={list} ratingSource={allGames} />
        </Panel>
      )}
      <ChessSection title="Highlights">
        <ChessSectionRow
          label="Most Faced"
          value={
            insights.mostFaced ? (
              <button
                type="button"
                className="ci-link-button"
                onClick={() => setSelected(insights.mostFaced!.name)}
              >
                {insights.mostFaced.name}
              </button>
            ) : (
              "—"
            )
          }
          detail={
            insights.mostFaced
              ? number(insights.mostFaced.games) +
                " games · " +
                percentage(insights.mostFaced.winRate) +
                " wins"
              : undefined
          }
        />
        <ChessSectionRow
          label="Highest Rated Beaten"
          value={number(insights.highestBeaten?.opponentRating)}
          detail={
            insights.highestBeaten
              ? (insights.highestBeaten.opponentUsername ?? "Unknown") +
                " · " +
                insights.highestBeaten.timeClass +
                " · " +
                displayDate(insights.highestBeaten.localDate)
              : undefined
          }
          href={insights.highestBeaten?.url || undefined}
        />
        <ChessSectionRow
          label="Highest Rated Faced"
          value={number(insights.highestFaced?.opponentRating)}
          detail={
            insights.highestFaced
              ? (insights.highestFaced.opponentUsername ?? "Unknown") +
                " · " +
                insights.highestFaced.timeClass +
                " · " +
                displayDate(insights.highestFaced.localDate)
              : undefined
          }
          href={insights.highestFaced?.url || undefined}
        />
        <ChessSectionRow
          label="Best Head-to-head"
          value={percentage(insights.best?.winRate)}
          detail={
            insights.best
              ? insights.best.name +
                " · " +
                number(insights.best.games) +
                " games"
              : "Requires " +
                MIN_OPPONENT_SAMPLE +
                " games against one opponent"
          }
        />
        <ChessSectionRow
          label="Worst Head-to-head"
          value={percentage(insights.worst?.winRate)}
          detail={
            insights.worst
              ? insights.worst.name +
                " · " +
                number(insights.worst.games) +
                " games"
              : "Requires " +
                MIN_OPPONENT_SAMPLE +
                " games against one opponent"
          }
        />
      </ChessSection>
      <details className="ci-details">
        <summary>More opponent details</summary>
        <div className="ci-two-columns">
          <Panel title="Most Faced Opponents">
            <Bars
              compact
              rows={rows
                .slice(0, 10)
                .map((row) => [
                  row.name,
                  row.games,
                  percentage(row.winRate) + " wins",
                ])}
            />
          </Panel>
          <Panel title="Head-to-head Performance">
            <Stacked
              data={rows
                .filter((row) => row.games >= MIN_OPPONENT_SAMPLE)
                .slice(0, 5)
                .map((row) => ({ ...row, label: row.name }))}
            />
          </Panel>
        </div>
        <Panel title="Opponent Rating and Result">
          <Scatter
            label="Opponent rating and result score"
            xLabel="Opponent rating"
            yLabel="Result score"
            data={games
              .filter((game) => game.opponentRating !== null)
              .filter(
                (_, index, values) =>
                  index % Math.max(1, Math.ceil(values.length / 300)) === 0,
              )
              .map((game) => ({
                label: game.localDate + " · " + game.opponentUsername,
                x: game.opponentRating!,
                y: game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0,
                detail: game.timeClass + " · " + game.result,
              }))}
          />
          <p className="ci-note">
            Up to 300 evenly sampled completed games; points can overlap.
            Scores: 1 = win, 0.5 = draw, 0 = loss. Rating pools are identified
            in details. This plot does not imply a correlation.
          </p>
        </Panel>
        <Panel title="Games by Opponent Rating Range">
          <Bars
            rows={opponentBuckets(games).map((bucket) => [
              bucket.label,
              bucket.games,
              percentage(bucket.winRate) + " wins",
            ])}
          />
        </Panel>
        <p className="ci-note">
          No additional opponent profile requests are made.
        </p>
      </details>
    </>
  );
}
