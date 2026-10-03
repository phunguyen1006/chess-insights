import { useMemo, useState, useEffect } from "react";
import type { NormalizedGame, PuzzleAttempt } from "../../../shared/types";
import type { ActivityMode } from "../../../analytics/puzzles";
import {
  combinedActivity,
  puzzleActivity,
  puzzleResults,
  puzzleHistoryKnown,
} from "../../../analytics/puzzles";
import { activity, activityBreakdown } from "../../../analytics/activity";
import { results } from "../../../analytics/results";
import { ActivityHeatmap } from "../../heatmap/ActivityHeatmap";
import type { HeatmapMetric } from "../../heatmap/ActivityHeatmap";
import { POOLS } from "../../../shared/constants";
import { displayDate } from "../../../shared/dates";
import { openInsights } from "../../../content/dom/routing";
import { Panel, Stats, Select, GameList, number } from "../components/Common";
import { Columns, Trend } from "../components/Charts";
import { monthlySeries } from "../../../analytics/visuals";
import type { GameDurationRecord } from "../../../analysis/playTime";
import { PlayTimeActivityPage } from "./PlayTimeActivityPage";
export function ActivityPage(props: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
  years: number[];
  date: string;
  onYear: (year: number) => void;
  selectedControl?: string;
  attempts?: PuzzleAttempt[];
  mode?: ActivityMode | "playTime";
  trackingSince?: string;
  durationRecords?: GameDurationRecord[];
  durationLoading?: boolean;
}) {
  const {
    games,
    attempts = [],
    mode = "all",
    trackingSince,
    date,
    years,
    onYear,
  } = props;
  const [year, setYear] = useState(
    date ? Number(date.slice(0, 4)) : new Date().getFullYear(),
  );
  useEffect(() => {
    if (date) setYear(Number(date.slice(0, 4)));
  }, [date]);
  const yearly = useMemo(
      () => games.filter((g) => Number(g.localDate.slice(0, 4)) === year),
      [games, year],
    ),
    puzzles = useMemo(
      () => attempts.filter((a) => Number(a.localDate.slice(0, 4)) === year),
      [attempts, year],
    );
  const combined = useMemo(
      () => combinedActivity(games, attempts),
      [games, attempts],
    ),
    p = useMemo(() => puzzleActivity(attempts), [attempts]);
  const ratingObservations = useMemo(
    () => [
      ...new Map(
        [...attempts]
          .sort((a, b) => a.attemptedAt - b.attemptedAt)
          .filter((a) => a.ratingAfter !== null)
          .map((a) => [a.localDate, a]),
      ).values(),
    ],
    [attempts],
  );
  const detail = (r: ReturnType<typeof puzzleResults>, activeDays?: number) =>
    `${r.attempts} attempts · ${r.solved} solved · ${r.failed} failed · ${r.resolved} resolved · ${r.successRate === null ? "No resolved attempts" : `${r.successRate.toFixed(1)}% success`}${activeDays === undefined ? "" : ` · ${activeDays} active days`}`;
  if (mode === "playTime") return <PlayTimeActivityPage {...props}/>;
  if (mode === "games") return <GameActivityPage {...props} />;
  return (
    <>
      <div className="ci-filters">
        <Select
          label="Calendar year"
          value={String(year)}
          options={[...new Set([year, ...years])]
            .sort((a, b) => b - a)
            .map(String)}
          onChange={(v) => {
            setYear(Number(v));
            onYear(Number(v));
          }}
        />
      </div>
      <Stats
        items={
          mode === "all"
            ? [
                ["Games", combined.games],
                ["Puzzle attempts", combined.puzzles],
                ["Active days", combined.activeDays],
                ["Current streak", combined.current],
                ["Longest streak", combined.longest],
              ]
            : [
                ["Attempts", p.attempts],
                ["Solved", p.solved],
                ["Failed", p.failed],
                [
                  "Success rate",
                  p.successRate === null ? "—" : `${p.successRate.toFixed(1)}%`,
                ],
                ["Puzzle active days", p.activeDays],
                ["Current puzzle streak", p.current],
                ["Longest puzzle streak", p.longest],
                ["Average puzzles / active day", number(p.average)],
                [
                  "Tracking since",
                  trackingSince ? displayDate(trackingSince) : "Not started",
                ],
              ]
        }
      />
      <Panel title={`${year} ${mode === "all" ? "chess" : "puzzle"} activity`}>
        <ActivityHeatmap
          games={yearly}
          attempts={puzzles}
          mode={mode}
          trackingSince={trackingSince}
          year={year}
          onDate={(d) => openInsights("activity", d)}
        />
        <p className="ci-note">
          {mode === "all"
            ? "Active days include games or puzzles. Each activity is normalized separately; the darker level is shown."
            : "Dates before local tracking began are unknown unless saved attempts were restored. Striped dates have no recorded history."}
        </p>
      </Panel>
      {!attempts.length && (
        <Panel title="Puzzle activity">
          <p>
            Puzzle tracking starts when you complete rated puzzles with this
            extension installed. Earlier puzzle history is not available from
            Chess.com. If you have a saved puzzle backup, restore it in
            Settings.
          </p>
          <p>
            {trackingSince
              ? `Tracking since ${displayDate(trackingSince)}.`
              : "Tracking will start when your signed-in account is detected."}
          </p>
          <a href="/puzzles/rated">Go to Puzzles →</a>
        </Panel>
      )}
      {mode === "puzzles" && attempts.length > 0 && (
        <>
          <div className="ci-two-columns">
            <Panel title="Puzzles by month">
              <Columns
                label="Puzzle attempts by month"
                data={p.months.map((m) => ({
                  label: m.label,
                  value: m.attempts,
                  detail: detail(m, m.activeDays),
                }))}
              />
            </Panel>
            <Panel title="Puzzle success rate">
              <Trend
                percent
                label="Puzzle success rate by month"
                data={p.months.map((m) => ({
                  label: m.label,
                  value: m.resolved >= 5 ? m.successRate : null,
                  detail: detail(m),
                }))}
              />
              <p className="ci-note">
                Months require at least five resolved attempts. Unknown results
                are excluded from success rate.
              </p>
            </Panel>
          </div>
          <div className="ci-two-columns">
            <Panel title="Puzzle rating history">
              {attempts.some((a) => a.ratingAfter !== null) ? (
                <Trend
                  baselineZero={false}
                  label="Daily observed puzzle rating"
                  data={ratingObservations.map((a) => ({
                    label: displayDate(a.localDate),
                    value: a.ratingAfter,
                    detail: `${new Date(a.attemptedAt).toLocaleString()} · ${a.result} · observed rating ${a.ratingAfter}`,
                  }))}
                />
              ) : (
                <p>
                  Puzzle rating history is not available from locally tracked
                  data yet.
                </p>
              )}
            </Panel>
            <Panel title="Puzzles by weekday">
              <Columns
                label="Puzzle attempts by weekday"
                data={p.weekdays.map((n, i) => ({
                  label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
                  value: n,
                }))}
              />
            </Panel>
          </div>
          <Panel title="Puzzle records">
            <Stats
              items={[
                [
                  "Most puzzles in one day",
                  p.most
                    ? `${displayDate(p.most[0])} · ${p.most[1].length}`
                    : "—",
                ],
                [
                  "Best success day",
                  p.best
                    ? `${displayDate(p.best.date)} · ${p.best.successRate!.toFixed(1)}% (${p.best.resolved} resolved)`
                    : "Needs five resolved attempts in a day",
                ],
                ["Longest puzzle streak", p.longest],
                [
                  "Most active month",
                  p.mostMonth?.attempts
                    ? `${p.mostMonth.label} · ${p.mostMonth.attempts}`
                    : "—",
                ],
              ]}
            />
          </Panel>
        </>
      )}
      {date && (
        <Panel title={displayDate(date)}>
          <p>
            {puzzleHistoryKnown(date, trackingSince) ||
            attempts.some((a) => a.localDate === date)
              ? detail(
                  puzzleResults(attempts.filter((a) => a.localDate === date)),
                )
              : "Puzzle history not tracked yet"}
          </p>
          {!puzzleHistoryKnown(date, trackingSince) &&
            attempts.some((a) => a.localDate === date) && (
              <p className="ci-note">
                Restored records; other attempts may be missing.
              </p>
            )}
          {mode === "all" && (
            <GameList
              games={games.filter((g) => g.localDate === date)}
              ratingSource={props.allGames}
            />
          )}
        </Panel>
      )}
    </>
  );
}
function GameActivityPage({
  games,
  allGames,
  years,
  date,
  onYear,
  selectedControl = "all",
}: {
  games: NormalizedGame[];
  allGames: NormalizedGame[];
  years: number[];
  date: string;
  onYear: (year: number) => void;
  selectedControl?: string;
}) {
  const [year, setYear] = useState(
      date ? Number(date.slice(0, 4)) : new Date().getFullYear(),
    ),
    [metric, setMetric] = useState<HeatmapMetric>("games"),
    [pool, setPool] = useState("rapid");
  const effectivePool = selectedControl === "all" ? pool : selectedControl;
  useEffect(() => {
    if (date) setYear(Number(date.slice(0, 4)));
  }, [date]);
  const yearly = useMemo(
    () =>
      games.filter(
        (g) =>
          Number(g.localDate.slice(0, 4)) === year &&
          (metric !== "rating" || g.timeClass === effectivePool),
      ),
    [games, year, metric, effectivePool],
  );
  const stats = activity(yearly),
    breakdown = activityBreakdown(yearly),
    selected = yearly.filter((g) => g.localDate === date),
    r = results(selected);
  return (
    <>
      <div className="ci-filters">
        <Select
          label="Calendar year"
          value={String(year)}
          options={[...new Set([year, ...years])]
            .sort((a, b) => b - a)
            .map((y) => String(y))}
          onChange={(v) => {
            setYear(Number(v));
            onYear(Number(v));
          }}
        />
        <Select
          label="Metric"
          value={metric}
          options={[
            ["games", "Games played"],
            ["wins", "Wins"],
            ["winRate", "Win rate"],
            ["rating", "Rating change"],
          ]}
          onChange={(v) => setMetric(v as HeatmapMetric)}
        />
        {metric === "rating" && selectedControl === "all" && (
          <Select
            label="Rating pool"
            value={pool}
            options={[...POOLS]}
            onChange={setPool}
          />
        )}
      </div>
      <Stats
        items={[
          ["Games", stats.games],
          ["Active days", stats.activeDays],
          ["Games / active day", number(stats.gamesPerActiveDay)],
          ["Current streak", stats.current],
          ["Longest streak", stats.longest],
          [
            "Most active day",
            stats.mostActiveDay
              ? `${displayDate(stats.mostActiveDay)} · ${stats.mostActiveCount}`
              : "—",
          ],
        ]}
      />
      <Panel title={`${year} activity`}>
        <ActivityHeatmap
          games={yearly}
          year={year}
          metric={metric}
          pool={effectivePool}
          ratingSource={allGames}
          onDate={(d) => openInsights("activity", d)}
        />
        {!yearly.length && (
          <p>
            No games found for {year}.{" "}
            <button
              onClick={() => {
                setYear(year - 1);
                onYear(year - 1);
              }}
            >
              Previous year
            </button>
          </p>
        )}
        {metric === "rating" && (
          <p className="ci-note">
            Movement between observed ratings in the selected pool; no combined
            rating.
          </p>
        )}
      </Panel>
      <div className="ci-two-columns">
        <Panel title="Games by month">
          <Columns
            label="Games by month"
            data={breakdown.months.map((n, m) => ({
              label: new Date(year, m, 1).toLocaleDateString("en", {
                month: "short",
              }),
              value: n,
            }))}
          />
        </Panel>
        <Panel
          title={`Weekdays · Most active: ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][breakdown.weekdays.indexOf(Math.max(...breakdown.weekdays))]}`}
        >
          <Columns
            label="Games by weekday"
            data={breakdown.weekdays.map((n, i) => ({
              label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
              value: n,
            }))}
          />
        </Panel>
      </div>
      <div className="ci-two-columns">
        <Panel title="Active days over time">
          <Trend
            area
            label="Active days by month"
            data={monthlySeries(yearly).map((m) => ({
              label: m.month,
              value: m.activeDays,
              detail: `${m.games} games · ${m.winRate.toFixed(1)}% wins`,
            }))}
          />
        </Panel>
        <Panel title="Monthly win rate">
          <Trend
            percent
            label="Monthly win rate"
            data={monthlySeries(yearly).map((m) => ({
              label: m.month,
              value: m.games >= 5 ? m.winRate : null,
              detail: `${m.games} games · ${m.wins} W / ${m.draws} D / ${m.losses} L`,
            }))}
          />
          <p className="ci-note">
            Months with fewer than five games are omitted. Percentages describe
            the games matching your filters.
          </p>
        </Panel>
      </div>
      {date && (
        <Panel title={displayDate(date)}>
          <Stats
            items={[
              ["Games", r.games],
              ["Wins", r.wins],
              ["Draws", r.draws],
              ["Losses", r.losses],
              ["Win rate", `${Math.round(r.winRate)}%`],
            ]}
          />
          <p>
            {POOLS.map(
              (p) =>
                `${p}: ${selected.filter((g) => g.timeClass === p).length}`,
            ).join(" · ")}
          </p>
          <GameList games={selected} ratingSource={allGames} />
        </Panel>
      )}
    </>
  );
}
