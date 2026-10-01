import type { NormalizedGame, Filters } from "../../../shared/types";
import { activity } from "../../../analytics/activity";
import {
  visualSummary,
  previousPeriod,
  terminationDistribution,
} from "../../../analytics/visuals";
import { Panel, Stats, Bars, signed } from "../components/Common";
import { Trend, Donut, Stacked } from "../components/Charts";
import { RatingCards } from "../components/RatingCards";
export function OverviewPage({
  games,
  allGames = games,
  filters,
}: {
  games: NormalizedGame[];
  allGames?: NormalizedGame[];
  filters?: Filters;
}) {
  const stats = activity(games),
    v = visualSummary(games),
    comparison = filters ? previousPeriod(allGames, filters) : null;
  const months = v.months.slice(-12),
    trend = months.map((m) => ({
      label: m.month,
      value: m.games,
      detail: `${m.activeDays} active days · ${m.winRate.toFixed(1)}% wins`,
    }));
  return (
    <>
      <div className="ci-kpi-grid">
        {[
          { label: "Total games", value: stats.games, data: trend },
          {
            label: "Win rate",
            value: stats.games ? `${stats.winRate.toFixed(1)}%` : "—",
            data: months.map((m) => ({
              label: m.month,
              value: m.games >= 5 ? m.winRate : null,
              detail: `${m.games} games · ${m.wins} wins`,
            })),
          },
          {
            label: "Active days",
            value: stats.activeDays,
            data: months.map((m) => ({
              label: m.month,
              value: m.activeDays,
              detail: `${m.games} games`,
            })),
          },
        ].map((k) => (
          <section className="ci-stat" key={k.label}>
            <span>{k.label}</span>
            <strong>{k.value}</strong>
            <Trend
              compact
              data={k.data}
              label={`${k.label} · monthly history`}
            />
            <p className="ci-note">
              Last {months.length} observed months in selected period
            </p>
          </section>
        ))}
      </div>
      {comparison && (
        <p className="ci-note">
          {comparison.previousGames ? (
            <>
              Compared with {comparison.start} – {comparison.end}:{" "}
              {signed(comparison.gamesChange)} games ·{" "}
              {signed(comparison.winRatePoints)} percentage points win rate.
              Previous period: {comparison.previousGames} cached games;
              comparison requires complete cached periods.
            </>
          ) : (
            <>
              Comparison unavailable: no cached games for {comparison.start} –{" "}
              {comparison.end}.
            </>
          )}
        </p>
      )}
      <Stats
        items={[
          ["Wins", stats.wins],
          ["Draws", stats.draws],
          ["Losses", stats.losses],
          ["Current streak", `${stats.current} days`],
          ["Longest streak", `${stats.longest} days`],
        ]}
      />
      <h2 className="ci-section-title">Rating snapshot</h2>
      <RatingCards games={games} />
      <p className="ci-note">
        Latest observed archive rating per pool in the selected period; never
        combined.
      </p>
      <Panel title="Activity snapshot · Monthly games">
        <Trend data={trend} label="Games played by month" area />
        <p className="ci-note">
          Monthly activity for the last 12 observed months matching your
          filters.
        </p>
      </Panel>
      <div className="ci-two-columns">
        <Panel title="Time controls">
          <Donut
            label="Time control distribution"
            data={v.pools.map((p) => ({
              label: p.label,
              value: p.games,
              detail: `${p.winRate.toFixed(1)}% wins`,
            }))}
          />
        </Panel>
        <Panel title="Color performance">
          <Stacked data={v.colors} />
        </Panel>
      </div>
      <div className="ci-two-columns">
        <Panel title="How you win">
          <Donut
            label="Winning terminations"
            data={terminationDistribution(games, "win")}
          />
        </Panel>
        <Panel title="How you lose">
          <Donut
            label="Losing terminations"
            data={terminationDistribution(games, "loss")}
            loss
          />
        </Panel>
      </div>
      <div className="ci-two-columns">
        <Panel title="Time control performance">
          <Stacked data={v.pools} />
        </Panel>
        <Panel title="Most played openings">
          <Bars
            rows={v.openings
              .slice(0, 5)
              .map((o) => [
                `${o.eco} · ${o.name} · ${o.color}`,
                o.games,
                `${o.winRate.toFixed(1)}% wins · ${o.wins} W / ${o.draws} D / ${o.losses} L`,
              ])}
          />
          {!v.openings.length && (
            <p className="ci-muted">No opening tags in this period.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
