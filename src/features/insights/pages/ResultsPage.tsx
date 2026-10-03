import type { NormalizedGame } from "../../../shared/types";
import {
  visualSummary,
  terminationDistribution,
} from "../../../analytics/visuals";
import { results } from "../../../analytics/results";
import { Bars, Empty, number } from "../components/Common";
import { Stacked, Trend } from "../components/Charts";
import {
  ChessSection,
  PoolIcon,
  StatSummaryRow,
  WdlBar,
  percentage,
} from "../components/NativeStats";
import { POOLS } from "../../../shared/constants";
export function ResultsPage({ games }: { games: NormalizedGame[] }) {
  const v = visualSummary(games),
    summary = results(games);
  const share = (count: number) =>
    percentage(games.length ? (100 * count) / games.length : null);
  return (
    <>
      <section className="ci-results-hero" aria-label="Results summary">
        <h2>Results</h2>
        <StatSummaryRow
          items={[
            ["Games", summary.games],
            ["Wins", summary.wins, share(summary.wins)],
            ["Draws", summary.draws, share(summary.draws)],
            ["Losses", summary.losses, share(summary.losses)],
          ]}
        />
        <WdlBar
          wins={summary.wins}
          draws={summary.draws}
          losses={summary.losses}
        />
      </section>
      <div className="ci-two-columns">
        {(["win", "loss"] as const).map((outcome) => {
          const title = outcome === "win" ? "How you win" : "How you lose",
            distribution = terminationDistribution(games, outcome),
            total = distribution.reduce((sum, entry) => sum + entry.value, 0);
          return (
            <ChessSection title={title} key={outcome}>
              <div
                role="group"
                aria-label={title}
                className={`ci-termination ci-termination-${outcome}`}
              >
                {distribution.length ? (
                  <Bars
                    rows={distribution.map((entry) => [
                      entry.label,
                      entry.value,
                      `${percentage((100 * entry.value) / total)} of ${number(total)} ${outcome === "win" ? "wins" : "losses"}`,
                    ])}
                  />
                ) : (
                  <Empty>
                    No {outcome === "win" ? "wins" : "losses"} in this period.
                  </Empty>
                )}
              </div>
            </ChessSection>
          );
        })}
      </div>
      <ChessSection title="How games are drawn">
        <div
          className="ci-termination ci-termination-draw"
          role="group"
          aria-label="How games are drawn"
        >
          {summary.draws ? (
            <Bars
              rows={terminationDistribution(games, "draw").map((entry) => [
                entry.label,
                entry.value,
                `${percentage((100 * entry.value) / summary.draws)} of ${number(summary.draws)} draws`,
              ])}
            />
          ) : (
            <Empty>No draws in this period.</Empty>
          )}
        </div>
      </ChessSection>
      <ChessSection title="Results by time control">
        <Stacked data={v.pools} />
      </ChessSection>
      <details className="ci-results-details">
        <summary>More results details</summary>
        <ChessSection title="Termination by time control">
          <div className="ci-two-columns">
            {POOLS.map((pool) => (
              <div key={pool}>
                <h3>
                  <PoolIcon pool={pool} />{" "}
                  {pool[0].toUpperCase() + pool.slice(1)}
                </h3>
                <Bars
                  rows={["Checkmate", "Resignation", "Timeout", "Other"].map(
                    (t) => [
                      t,
                      games.filter(
                        (g) =>
                          g.timeClass === pool &&
                          (t === "Other"
                            ? !["Checkmate", "Resignation", "Timeout"].includes(
                                g.termination,
                              )
                            : g.termination === t),
                      ).length,
                    ],
                  )}
                />
              </div>
            ))}
          </div>
        </ChessSection>
        <ChessSection title="Timeout-loss rate by month">
          <Trend
            percent
            label="Timeout losses as a percentage of all games"
            data={v.months.map((m) => ({
              label: m.month,
              value: m.games >= 5 ? m.timeoutLossRate : null,
              detail: `${m.games} total games · ${Math.round((m.timeoutLossRate * m.games) / 100)} timeout losses`,
            }))}
          />
          <p className="ci-note">
            Timeout losses divided by all completed games. Months with fewer
            than five games are omitted from the line.
          </p>
        </ChessSection>
      </details>
    </>
  );
}
