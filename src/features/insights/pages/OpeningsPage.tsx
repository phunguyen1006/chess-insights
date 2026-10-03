import { useState, useMemo } from "react";
import type { NormalizedGame } from "../../../shared/types";
import { rankOpenings } from "../../../analytics/openings";
import { Select, Empty, Bars, number } from "../components/Common";
import { Stacked, Scatter } from "../components/Charts";
import { openingScatter, visualSummary } from "../../../analytics/visuals";
import { MIN_OPENING_SAMPLE } from "../../../shared/constants";
import {
  ChessSection,
  SegmentedControl,
  percentage,
} from "../components/NativeStats";
export function OpeningsPage({
  games,
  color,
  onColorChange,
}: {
  games: NormalizedGame[];
  color?: string;
  onColorChange?: (color: string) => void;
}) {
  const [mode, setMode] = useState("most"),
    [localColor, setLocalColor] = useState("all");
  const selectedColor = color ?? localColor;
  const selectedGames = useMemo(
      () =>
        selectedColor === "all"
          ? games
          : games.filter((game) => game.playerColor === selectedColor),
      [games, selectedColor],
    ),
    rows = rankOpenings(selectedGames, mode),
    visuals = visualSummary(selectedGames);
  return (
    <>
      <div className="ci-opening-controls">
        <SegmentedControl
          label="Opening color"
          value={selectedColor}
          options={[
            ["all", "All Games"],
            ["white", "White"],
            ["black", "Black"],
          ]}
          onChange={onColorChange ?? setLocalColor}
        />
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
      </div>
      <ChessSection title="Opening repertoire">
        {rows.length ? (
          <div className="ci-table-scroll">
            <table className="ci-table ci-opening-table">
              <thead>
                <tr>
                  {["Opening", "Color", "Games", "Win %", "W / D / L"].map(
                    (heading) => (
                      <th key={heading}>{heading}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.eco}</strong> · {row.name}
                    </td>
                    <td>{row.color === "white" ? "White" : "Black"}</td>
                    <td>{number(row.games)}</td>
                    <td>
                      <div className="ci-opening-winrate">
                        <span>{percentage(row.winRate)}</span>
                        <div aria-hidden="true">
                          <i style={{ width: `${row.winRate}%` }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ci-positive">{number(row.wins)} W</span>{" "}
                      ·{" "}
                      <span className="ci-neutral">{number(row.draws)} D</span>{" "}
                      ·{" "}
                      <span className="ci-negative">
                        {number(row.losses)} L
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No openings with sufficient data match these filters.</Empty>
        )}
        <p className="ci-note">
          Best and worst rankings require {MIN_OPENING_SAMPLE} games. White and
          black are separate groups. Supplied PGN opening / ECO tags are used.
        </p>
      </ChessSection>
      <details className="ci-opening-details">
        <summary>More opening details</summary>
        <div className="ci-two-columns">
          <ChessSection title="Most played openings">
            <Bars
              compact
              rows={visuals.openings
                .slice(0, 10)
                .map((o) => [
                  `${o.eco} · ${o.name} · ${o.color}`,
                  o.games,
                  `${o.winRate.toFixed(1)}% wins`,
                ])}
            />
          </ChessSection>
          <ChessSection title="Opening results">
            <Stacked
              data={visuals.openings.slice(0, 5).map((o) => ({
                ...o,
                label: `${o.eco} · ${o.name} · ${o.color}`,
              }))}
            />
          </ChessSection>
        </div>
        <ChessSection title="Opening sample size versus win rate">
          <Scatter
            label="Opening sample size versus win rate"
            xLabel="Games"
            yLabel="Win rate"
            percent
            data={openingScatter(selectedGames)}
          />
          <p className="ci-note">
            Top 20 openings with at least {MIN_OPENING_SAMPLE} games, grouped
            separately by color. Small samples do not establish strength.
          </p>
        </ChessSection>
      </details>
    </>
  );
}
