import { useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import {
  aggregateOpponents,
  opponentInsights,
} from "../../../analytics/opponents";
import { aggregateOpenings } from "../../../analytics/openings";
import { MIN_OPPONENT_SAMPLE, POOLS } from "../../../shared/constants";
import {
  Panel,
  Stats,
  GameList,
  number,
  signed,
  Empty,
  Bars,
} from "../components/Common";
import { Stacked, Scatter } from "../components/Charts";
import { opponentBuckets } from "../../../analytics/visuals";
export function OpponentsPage({
  games,
  allGames,
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
}) {
  const [selected, setSelected] = useState("");
  const rows = aggregateOpponents(games),
    insights = opponentInsights(games),
    detail = rows.find((r) => r.name === selected),
    list = games.filter((g) => g.opponentUsername?.toLowerCase() === selected);
  return (
    <>
      <div className="ci-two-columns">
        <Panel title="Most faced opponents">
          <Bars
            compact
            rows={rows
              .slice(0, 10)
              .map((r) => [r.name, r.games, `${r.winRate.toFixed(1)}% wins`])}
          />
        </Panel>
        <Panel title="Head-to-head performance">
          <Stacked
            data={rows
              .filter((r) => r.games >= MIN_OPPONENT_SAMPLE)
              .slice(0, 5)
              .map((r) => ({ ...r, label: r.name }))}
          />
        </Panel>
      </div>
      <Panel title="Opponent rating and result">
        <Scatter
          label="Opponent rating and result score"
          xLabel="Opponent rating"
          yLabel="Result score"
          data={games
            .filter((g) => g.opponentRating !== null)
            .filter(
              (_, i, a) => i % Math.max(1, Math.ceil(a.length / 300)) === 0,
            )
            .map((g) => ({
              label: `${g.localDate} · ${g.opponentUsername}`,
              x: g.opponentRating!,
              y: g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0,
              detail: `${g.timeClass} · ${g.result}`,
            }))}
        />
        <p className="ci-note">
          Up to 300 evenly sampled completed games; points can overlap. Scores:
          1 = win, 0.5 = draw, 0 = loss. Rating pools are identified in details.
          This plot does not imply a correlation.
        </p>
      </Panel>
      <Panel title="Games by opponent rating range">
        <Bars
          rows={opponentBuckets(games).map((b) => [
            b.label,
            b.games,
            `${b.winRate.toFixed(1)}% wins`,
          ])}
        />
      </Panel>
      <Stats
        items={[
          ["Most faced", insights.mostFaced?.name ?? "—"],
          [
            "Highest rated faced",
            insights.highestFaced
              ? `${insights.highestFaced.opponentUsername} · ${number(insights.highestFaced.opponentRating)}`
              : "—",
          ],
          [
            "Highest rated beaten",
            insights.highestBeaten
              ? `${insights.highestBeaten.opponentUsername} · ${number(insights.highestBeaten.opponentRating)}`
              : "—",
          ],
          [
            "Best head-to-head",
            insights.best
              ? `${insights.best.name} · ${Math.round(insights.best.winRate)}%`
              : "—",
          ],
          [
            "Worst head-to-head",
            insights.worst
              ? `${insights.worst.name} · ${Math.round(insights.worst.winRate)}%`
              : "—",
          ],
        ]}
      />
      <Panel title="Most played opponents">
        <p className="ci-note">
          Head-to-head rankings require {MIN_OPPONENT_SAMPLE} games. No
          additional opponent profile requests are made.
        </p>
        {rows.length ? (
          <div className="ci-table-scroll">
            <table className="ci-table">
              <thead>
                <tr>
                  {[
                    "Opponent",
                    "Games",
                    "Wins",
                    "Draws",
                    "Losses",
                    "Win rate",
                    "Average opponent rating",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <button
                        className="ci-link-button"
                        onClick={() => setSelected(r.name)}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td>{r.games}</td>
                    <td>{r.wins}</td>
                    <td>{r.draws}</td>
                    <td>{r.losses}</td>
                    <td>{Math.round(r.winRate)}%</td>
                    <td>{number(r.averageRating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
      {detail && (
        <Panel title={`Games vs ${selected}`}>
          <Stats
            items={[
              ["Games", detail.games],
              ["Wins", detail.wins],
              ["Draws", detail.draws],
              ["Losses", detail.losses],
              ["Average rating difference", signed(detail.averageDifference)],
            ]}
          />
          <p>
            {POOLS.map(
              (p) => `${p}: ${list.filter((g) => g.timeClass === p).length}`,
            ).join(" · ")}
          </p>
          <p className="ci-note">
            Openings:{" "}
            {aggregateOpenings(list)
              .slice(0, 5)
              .map((o) => `${o.name} (${o.games})`)
              .join(" · ") || "No opening tags"}
          </p>
          <GameList games={list} ratingSource={allGames} />
        </Panel>
      )}
    </>
  );
}
