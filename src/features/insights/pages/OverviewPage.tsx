import type { NormalizedGame, Filters } from "../../../shared/types";
import type { GameDurationRecord } from "../../../analysis/playTime";
import { activity } from "../../../analytics/activity";
import { playTimeSummary } from "../../../analytics/playTime";
import { filterGames } from "../../../analytics/results";
import {
  visualSummary,
  previousPeriod,
  terminationDistribution,
} from "../../../analytics/visuals";
import { Panel, Bars, signed } from "../components/Common";
import { Trend, Stacked } from "../components/Charts";
import {
  ChessSection,
  ChessSectionRow,
  formatDuration,
  percentage,
  StatSummaryRow,
  WdlBar,
} from "../components/NativeStats";
import { RatingCards } from "../components/RatingCards";

export function OverviewPage({
  games,
  allGames = games,
  filters,
  durationRecords = [],
  durationLoading = false,
}: {
  games: NormalizedGame[];
  allGames?: NormalizedGame[];
  filters?: Filters;
  durationRecords?: GameDurationRecord[];
  durationLoading?: boolean;
}) {
  const stats = activity(games),
    v = visualSummary(games),
    comparison = filters ? previousPeriod(allGames, filters) : null;
  const time = playTimeSummary(games, durationRecords);
  const previous =
    filters && comparison
      ? playTimeSummary(
          filterGames(allGames, {
            ...filters,
            start: comparison.start,
            end: comparison.end,
          }),
          durationRecords,
        )
      : null;
  const months = v.months.slice(-12),
    trend = months.map((m) => ({
      label: m.month,
      value: m.games,
      detail: `${m.activeDays} active days · ${m.winRate.toFixed(1)}% wins`,
    }));
  const timeTrend = time.byMonth
    .slice(-12)
    .map((m) => ({
      label: m.month,
      value: m.games ? m.durationSeconds / 3600 : m.eligibleGames ? null : 0,
      detail: `${formatDuration(m.durationSeconds)} · ${m.games}/${m.eligibleGames} games with duration`,
    }));
  const reasons = (outcome: "win" | "loss") =>
    terminationDistribution(games, outcome).map(
      (r): [string, number, string] => [
        r.label,
        r.value,
        percentage(
          (r.value /
            Math.max(1, outcome === "win" ? stats.wins : stats.losses)) *
            100,
        ),
      ],
    );
  return (
    <>
      <StatSummaryRow
        items={[
          ["Games", stats.games],
          ["Win rate", stats.games ? percentage(stats.winRate) : "—"],
          ["Active days", stats.activeDays],
          [
            time.coverage === 1 ? "Total play time" : "Recorded play time",
            time.withDuration ? formatDuration(time.totalRecordedSeconds) : "—",
          ],
        ]}
      />
      <div className="ci-overview-time-preview">
        <Trend
          compact
          area
          data={timeTrend}
          label="Recorded play time by month, hours"
        />
        <p className="ci-note">
          Duration available for {time.withDuration}/
          {time.eligibleRealtimeGames} real-time games (
          {percentage(time.eligibleRealtimeGames ? time.coverage * 100 : null)}
          ). Daily excluded.
          {durationLoading ? " Parsing remaining history…" : ""}{" "}
          <a href="#chess-insights/time?timeView=play-time">View play time →</a>
        </p>
      </div>
      <RatingCards games={games} />
      <Panel title="Activity">
        <Trend data={trend} label="Games played by month" area tall />
      </Panel>
      <StatSummaryRow
        items={[
          [
            "Wins",
            stats.wins,
            percentage(stats.games ? (stats.wins / stats.games) * 100 : null),
          ],
          [
            "Draws",
            stats.draws,
            percentage(stats.games ? (stats.draws / stats.games) * 100 : null),
          ],
          [
            "Losses",
            stats.losses,
            percentage(stats.games ? (stats.losses / stats.games) * 100 : null),
          ],
        ]}
      />
      <WdlBar wins={stats.wins} draws={stats.draws} losses={stats.losses} />
      <ChessSection title="Highlights">
        <ChessSectionRow
          label="Most active day"
          value={`${stats.mostActiveCount} games`}
          detail={stats.mostActiveDay ?? undefined}
        />
        <ChessSectionRow
          label="Longest playing streak"
          value={`${stats.longest} days`}
        />
        <ChessSectionRow
          label="Current playing streak"
          value={`${stats.current} days`}
        />
        <ChessSectionRow
          label="Most recorded play time in a day"
          value={formatDuration(time.highlights.mostTimeDay?.durationSeconds)}
          detail={time.highlights.mostTimeDay?.date}
        />
        {previous && comparison && (
          <ChessSectionRow
            label="Play time vs previous period"
            value={
              previous.withDuration && time.withDuration
                ? `${time.totalRecordedSeconds >= previous.totalRecordedSeconds ? "↑" : "↓"} ${formatDuration(Math.abs(time.totalRecordedSeconds - previous.totalRecordedSeconds))}`
                : "—"
            }
            detail={`${comparison.start} – ${comparison.end}; duration coverage ${percentage(previous.eligibleRealtimeGames ? previous.coverage * 100 : null)} vs ${percentage(time.eligibleRealtimeGames ? time.coverage * 100 : null)}; cached history only`}
          />
        )}
      </ChessSection>
      <details className="ci-details">
        <summary>More activity details</summary>
        {comparison && (
          <p className="ci-note">
            Previous cached period {comparison.start} – {comparison.end}:{" "}
            {comparison.previousGames} games; {signed(comparison.gamesChange)}{" "}
            games, {signed(comparison.winRatePoints)} percentage points win
            rate. Comparisons require complete cached periods.
          </p>
        )}
        <div className="ci-two-columns">
          <Panel title="Time controls">
            <Bars
              rows={v.pools.map((p) => [
                p.label,
                p.games,
                `${percentage(p.winRate)} wins`,
              ])}
            />
          </Panel>
          <Panel title="Color performance">
            <Stacked data={v.colors} />
          </Panel>
        </div>
        <div className="ci-two-columns">
          <Panel title="How you win">
            <Bars rows={reasons("win")} />
          </Panel>
          <Panel title="How you lose">
            <div className="ci-loss-bars">
              <Bars rows={reasons("loss")} />
            </div>
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
                  `${percentage(o.winRate)} wins · ${o.wins} W / ${o.draws} D / ${o.losses} L`,
                ])}
            />
            {!v.openings.length && (
              <p className="ci-muted">No opening tags in this period.</p>
            )}
          </Panel>
        </div>
      </details>
    </>
  );
}
