import { useEffect, useMemo, useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import type { GameDurationRecord } from "../../../analysis/playTime";
import { playTimeSummary } from "../../../analytics/playTime";
import { ActivityHeatmap } from "../../heatmap/ActivityHeatmap";
import { Panel, Select, GameList } from "../components/Common";
import {
  ChessSection,
  ChessSectionRow,
  StatSummaryRow,
  formatDuration,
  percentage,
} from "../components/NativeStats";
import { Trend } from "../components/Charts";
import { displayDate } from "../../../shared/dates";

export function PlayTimeActivityPage({
  games,
  allGames,
  years,
  date,
  onYear,
  durationRecords = [],
  durationLoading = false,
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
  years: number[];
  date: string;
  onYear: (year: number) => void;
  durationRecords?: GameDurationRecord[];
  durationLoading?: boolean;
}) {
  const [year, setYear] = useState(
    date ? Number(date.slice(0, 4)) : new Date().getFullYear(),
  );
  useEffect(() => {
    if (date) setYear(Number(date.slice(0, 4)));
  }, [date]);
  const yearly = useMemo(
    () => games.filter((g) => Number(g.localDate.slice(0, 4)) === year),
    [games, year],
  );
  const time = useMemo(
    () => playTimeSummary(yearly, durationRecords),
    [yearly, durationRecords],
  );
  const selected = yearly.filter((g) => g.localDate === date),
    daily = playTimeSummary(selected, durationRecords);
  return (
    <>
      <div className="ci-filters">
        <Select
          label="Calendar year"
          value={String(year)}
          options={[...new Set([year, ...years])]
            .sort((a, b) => b - a)
            .map(String)}
          onChange={(value) => {
            setYear(Number(value));
            onYear(Number(value));
          }}
        />
      </div>
      <StatSummaryRow
        items={[
          [
            time.coverage === 1 ? "Total play time" : "Recorded play time",
            time.withDuration ? formatDuration(time.totalRecordedSeconds) : "—",
          ],
          [
            "Games with duration",
            `${time.withDuration}/${time.eligibleRealtimeGames}`,
          ],
          [
            "Duration coverage",
            percentage(time.eligibleRealtimeGames ? time.coverage * 100 : null),
          ],
          ["Average game", formatDuration(time.averageDurationSeconds)],
        ]}
      />
      <Panel title={`${year} play time`}>
        <ActivityHeatmap
          games={yearly}
          year={year}
          metric="playTime"
          durationRecords={durationRecords}
          onDate={(value) => {
            location.hash = `chess-insights/activity?activity=playTime&date=${encodeURIComponent(value)}`;
          }}
        />
        <p className="ci-note">
          Intensity uses recorded seconds, assigned to the local date the game
          ended. Striped days have games but no duration. Daily excluded.
          {durationLoading ? " Parsing remaining history…" : ""}
        </p>
      </Panel>
      <Panel title="Play time by month">
        <Trend
          area
          label="Recorded play time by month, hours"
          data={Array.from({ length: 12 }, (_, i) => {
            const key = `${year}-${String(i + 1).padStart(2, "0")}`,
              month = time.byMonth.find((m) => m.month === key);
            return {
              label: new Date(year, i, 1).toLocaleDateString("en", {
                month: "short",
              }),
              value:
                month?.eligibleGames && !month.games
                  ? null
                  : (month?.durationSeconds ?? 0) / 3600,
              detail: month
                ? `${formatDuration(month.durationSeconds)} · ${month.games}/${month.eligibleGames} games with duration`
                : "No recorded games",
            };
          })}
        />
      </Panel>
      <ChessSection title="Highlights">
        <ChessSectionRow
          label="Most recorded time in a day"
          value={formatDuration(time.highlights.mostTimeDay?.durationSeconds)}
          detail={time.highlights.mostTimeDay?.date}
        />
        <ChessSectionRow
          label="Most recorded time in a month"
          value={formatDuration(time.highlights.mostTimeMonth?.durationSeconds)}
          detail={time.highlights.mostTimeMonth?.month}
        />
        <ChessSectionRow
          label="Longest recorded game"
          value={formatDuration(
            time.highlights.longestGame?.record.durationSeconds,
          )}
          detail={
            time.highlights.longestGame?.game.opponentUsername ?? undefined
          }
          href={time.highlights.longestGame?.game.url}
        />
      </ChessSection>
      {date && (
        <Panel title={displayDate(date)}>
          <StatSummaryRow
            items={[
              [
                "Recorded play time",
                daily.withDuration
                  ? formatDuration(daily.totalRecordedSeconds)
                  : "—",
              ],
              [
                "Duration coverage",
                `${daily.withDuration}/${daily.eligibleRealtimeGames}`,
              ],
            ]}
          />
          <GameList games={selected} ratingSource={allGames} />
        </Panel>
      )}
    </>
  );
}
