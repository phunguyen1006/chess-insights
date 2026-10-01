import type { NormalizedGame } from "../../../shared/types";
import {
  visualSummary,
  terminationDistribution,
} from "../../../analytics/visuals";
import { Panel, Bars } from "../components/Common";
import { Donut, Stacked, Trend } from "../components/Charts";
import { POOLS } from "../../../shared/constants";
export function ResultsPage({ games }: { games: NormalizedGame[] }) {
  const v = visualSummary(games);
  return (
    <>
      <div className="ci-two-columns">
        <Panel title="How you win">
          <Donut
            label="How you win"
            data={terminationDistribution(games, "win")}
          />
        </Panel>
        <Panel title="How you lose">
          <Donut
            label="How you lose"
            data={terminationDistribution(games, "loss")}
            loss
          />
        </Panel>
      </div>
      <Panel title="How games are drawn">
        <Bars
          rows={terminationDistribution(games, "draw").map((d) => [
            d.label,
            d.value,
          ])}
        />
        {!games.some((g) => g.result === "draw") && (
          <p className="ci-muted">No draws in this period.</p>
        )}
      </Panel>
      <Panel title="Results by time control">
        <Stacked data={v.pools} />
      </Panel>
      <Panel title="Termination by time control">
        <div className="ci-two-columns">
          {POOLS.map((pool) => (
            <div key={pool}>
              <h3>{pool}</h3>
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
      </Panel>
      <Panel title="Timeout-loss rate by month">
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
          Timeout losses divided by all completed games. Months with fewer than
          five games are omitted from the line.
        </p>
      </Panel>
    </>
  );
}
