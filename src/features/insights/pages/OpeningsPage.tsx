import { useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import { rankOpenings } from "../../../analytics/openings";
import { Panel, Select, Empty, Bars } from "../components/Common";
import { Stacked, Scatter } from "../components/Charts";
import { openingScatter, visualSummary } from "../../../analytics/visuals";
import { MIN_OPENING_SAMPLE } from "../../../shared/constants";
export function OpeningsPage({ games }: { games: NormalizedGame[] }) {
  const [mode, setMode] = useState("most");
  const rows = rankOpenings(games, mode);
  return (
    <>
      <div className="ci-two-columns">
        <Panel title="Most played openings">
          <Bars
            compact
            rows={visualSummary(games)
              .openings.slice(0, 10)
              .map((o) => [
                `${o.eco} · ${o.name} · ${o.color}`,
                o.games,
                `${o.winRate.toFixed(1)}% wins`,
              ])}
          />
        </Panel>
        <Panel title="Opening results">
          <Stacked
            data={visualSummary(games)
              .openings.slice(0, 5)
              .map((o) => ({
                ...o,
                label: `${o.eco} · ${o.name} · ${o.color}`,
              }))}
          />
        </Panel>
      </div>
      <Panel title="Opening sample size versus win rate">
        <Scatter
          label="Opening sample size versus win rate"
          xLabel="Games"
          yLabel="Win rate"
          percent
          data={openingScatter(games)}
        />
        <p className="ci-note">
          Top 20 openings with at least {MIN_OPENING_SAMPLE} games, grouped
          separately by color. Small samples do not establish strength.
        </p>
      </Panel>
      <Select
        label="Opening ranking"
        value={mode}
        options={[
          ["most", "Most played"],
          ["best", "Best performing"],
          ["worst", "Worst performing"],
        ]}
        onChange={setMode}
      />
      <Panel title="Opening repertoire">
        <p className="ci-note">
          Best and worst rankings require {MIN_OPENING_SAMPLE} games. White and
          black are separate groups. Supplied PGN opening / ECO tags are used.
        </p>
        {rows.length ? (
          <div className="ci-table-scroll">
            <table className="ci-table">
              <thead>
                <tr>
                  {[
                    "ECO",
                    "Opening",
                    "Color",
                    "Games",
                    "Wins",
                    "Draws",
                    "Losses",
                    "Win rate",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.eco}</td>
                    <td>{r.name}</td>
                    <td>{r.color}</td>
                    <td>{r.games}</td>
                    <td>{r.wins}</td>
                    <td>{r.draws}</td>
                    <td>{r.losses}</td>
                    <td>{Math.round(r.winRate)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No openings with sufficient data match these filters.</Empty>
        )}
      </Panel>
    </>
  );
}
