import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { NormalizedGame, TimeClass } from "../../../shared/types";
import type { GameDurationRecord } from "../../../analysis/playTime";
import { POOLS } from "../../../shared/constants";
import { addDays, localDate, parseDate, timezone } from "../../../shared/dates";
import {
  buildLifeReview,
  LIFE_REVIEW_RANGES,
  resolveLifeRange,
  sanitizeLifeGames,
  type LifeDay,
  type LifeRangeKey,
} from "../../../analytics/lifeReviewMetrics";
import {
  buildLifeEvidence,
  buildLifeMoments,
  generateLifeReviewInsights,
  safeLifeGameUrl,
  type LifeGroup,
  type LifeMoment,
} from "../../../analytics/lifeReviewInsights";
import { useAnalysis } from "../../state/useAnalysis";
import {
  ActivityHeatmap,
  type HeatmapMetric,
} from "../../heatmap/ActivityHeatmap";
import { Bars, Empty, number, Panel, Select } from "../components/Common";
import { Columns, Trend } from "../components/Charts";
import {
  ChessSection,
  ChessSectionRow,
  formatDuration,
  percentage,
  SegmentedControl,
  StatSummaryRow,
} from "../components/NativeStats";
import {
  LifeReviewShareCard,
  ResultComparison,
  SessionTimeline,
  WeekHourMatrix,
} from "../components/LifeReviewVisuals";

const signed = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : `${n > 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
const relative = (current: number, previous: number) =>
  previous
    ? `${signed((current / previous - 1) * 100, 1)}%`
    : "No prior baseline";
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const varianceValue = (value: number | null) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumSignificantDigits: 3 });
function routeSelection() {
  const p = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const key = p.get("review") ?? "month";
  return {
    key: (LIFE_REVIEW_RANGES.some(([k]) => k === key)
      ? key
      : "month") as LifeRangeKey,
    start: p.get("from") ?? "",
    end: p.get("to") ?? "",
    pool: POOLS.includes(p.get("pool") as (typeof POOLS)[number])
      ? (p.get("pool") as TimeClass)
      : undefined,
  };
}
function PeriodHeading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="ci-life-heading">
      <p className="ci-muted ci-life-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="ci-muted">{children}</p>}
    </div>
  );
}
function MomentRows({
  moments,
  empty,
}: {
  moments: LifeMoment[];
  empty: string;
}) {
  return moments.length ? (
    moments.map((m) => (
      <ChessSectionRow
        key={`${m.date}:${m.title}`}
        label={m.title}
        detail={`${m.date} · ${m.detail}`}
        value={m.game && safeLifeGameUrl(m.game.url) ? "View game ↗" : ""}
        href={m.game ? (safeLifeGameUrl(m.game.url) ?? undefined) : undefined}
      />
    ))
  ) : (
    <Empty>{empty}</Empty>
  );
}
function GroupTable({
  rows,
  pools = false,
}: {
  rows: LifeGroup[];
  pools?: boolean;
}) {
  return (
    <div className="ci-table-scroll">
      <table className="ci-table">
        <caption className="ci-note">
          Win rate counts wins only. Score includes half a point per draw.
        </caption>
        <thead>
          <tr>
            {[
              "Group",
              "Games",
              "Win %",
              "Score %",
              ...(pools ? ["Observed Δ"] : []),
              "Blunders / analyzed game",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>{number(r.games)}</td>
              <td>{r.games ? percentage(r.winRate) : "—"}</td>
              <td>{r.games ? percentage(r.score) : "—"}</td>
              {pools && (
                <td>
                  {signed(r.observedChange)}
                  <small>First → last rated observation</small>
                </td>
              )}
              <td>
                {r.blundersPerGame == null ? "—" : r.blundersPerGame.toFixed(2)}
                <small>
                  {r.analyzed}/{r.games} analyzed
                </small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function volumeSeries(days: LifeDay[]) {
  if (days.length <= 62)
    return days.map((d) => ({
      label: d.date.slice(5),
      value: d.games,
      detail: `${d.date} · ${d.wins} W / ${d.draws} D / ${d.losses} L · ${formatDuration(d.seconds)} recorded`,
    }));
  const monthly = days.length > 370;
  const groups = new Map<
    string,
    { games: number; wins: number; days: number }
  >();
  for (const day of days) {
    const key = monthly
      ? day.date.slice(0, 7)
      : addDays(day.date, -((parseDate(day.date).getDay() + 6) % 7));
    const row = groups.get(key) ?? { games: 0, wins: 0, days: 0 };
    row.games += day.games;
    row.wins += day.wins;
    row.days++;
    groups.set(key, row);
  }
  return [...groups].map(([label, row]) => ({
    label,
    value: row.games,
    detail: `${row.days} selected calendar days · ${row.wins} wins`,
  }));
}

export function LifeReviewPage({
  username,
  allGames,
  years,
  version,
  durationRecords = [],
  durationLoading = false,
  loadingHistory = false,
  onLoadYears,
  theme = "light",
}: {
  username: string;
  allGames: NormalizedGame[];
  years: number[];
  version: number;
  durationRecords?: GameDurationRecord[];
  durationLoading?: boolean;
  loadingHistory?: boolean;
  onLoadYears: (years: number[]) => Promise<void>;
  theme?: "light" | "dark";
}) {
  const [selection, setSelection] = useState(routeSelection),
    [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!loadingHistory) setNow(new Date());
  }, [version, loadingHistory]);
  const [calendarYear, setCalendarYear] = useState<number | null>(null),
    [metric, setMetric] = useState<HeatmapMetric>("games"),
    [matrixMetric, setMatrixMetric] = useState<"games" | "time">("games"),
    [openingColor, setOpeningColor] = useState("all"),
    [qualityMetric, setQualityMetric] = useState("blunders"),
    [day, setDay] = useState("");
  useEffect(() => {
    const update = () => {
      setSelection(routeSelection());
      setNow(new Date());
      setDay("");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const source = useMemo(
    () => sanitizeLifeGames(allGames, now.getTime()),
    [allGames, now],
  );
  const range = useMemo(
    () =>
      resolveLifeRange(
        selection.key,
        now,
        selection.start,
        selection.end,
        source[0]?.localDate,
      ),
    [selection, now, source],
  );
  const review = useMemo(
    () => buildLifeReview(source, range, durationRecords, selection.pool),
    [source, range, durationRecords, selection.pool],
  );
  const analysis = useAnalysis(username, source, false, version, false);
  const evidence = useMemo(
    () =>
      buildLifeEvidence(
        review.games,
        review.previousGames,
        analysis.state.analyses,
        analysis.state.mistakes,
        durationRecords,
      ),
    [
      review.games,
      review.previousGames,
      analysis.state.analyses,
      analysis.state.mistakes,
      durationRecords,
    ],
  );
  const insights = useMemo(
    () => generateLifeReviewInsights(evidence, review.rating, review.pool),
    [evidence, review.rating, review.pool],
  );
  const moments = useMemo(
    () =>
      buildLifeMoments(
        review.games,
        review.current.time,
        review.rating,
        review.current.streaks,
        durationRecords,
      ),
    [review, durationRecords],
  );
  const volume = useMemo(
    () => volumeSeries(review.current.days),
    [review.current.days],
  );
  const requestedYears = range.error
    ? ""
    : selection.key === "all"
      ? years.join(",")
      : [
          ...new Set(
            years.filter(
              (year) =>
                (year >= Number(range.start.slice(0, 4)) &&
                  year <= Number(range.end.slice(0, 4))) ||
                (range.previous &&
                  year >= Number(range.previous.start.slice(0, 4)) &&
                  year <= Number(range.previous.end.slice(0, 4))),
            ),
          ),
        ]
          .sort()
          .join(",");
  useEffect(() => {
    if (requestedYears) void onLoadYears(requestedYears.split(",").map(Number));
  }, [requestedYears, onLoadYears]);
  const updateSelection = (next: Partial<typeof selection>) => {
    const s = { ...selection, ...next },
      p = new URLSearchParams();
    p.set("review", s.key);
    if (s.key === "custom") {
      if (s.start) p.set("from", s.start);
      if (s.end) p.set("to", s.end);
    }
    if (s.pool) p.set("pool", s.pool);
    setSelection(s);
    setNow(new Date());
    setCalendarYear(null);
    setDay("");
    location.hash = `chess-insights/life-review?${p}`;
  };
  const c = review.current,
    p = review.previous,
    r = review.rating;
  const calendarYears = Array.from(
    {
      length: Math.max(
        1,
        Number(range.end.slice(0, 4)) - Number(range.start.slice(0, 4)) + 1,
      ),
    },
    (_, i) => Number(range.start.slice(0, 4)) + i,
  ).reverse();
  const shownYear = calendarYears.includes(calendarYear ?? -1)
    ? calendarYear!
    : calendarYears[0];
  const favorite = evidence.openings.find((o) => o.games > 0)?.label ?? null;
  const busiest = [...c.weekday].sort((a, b) => b.games - a.games)[0];
  const openingRows = evidence.openings.filter(
    (g) => openingColor === "all" || g.color === openingColor,
  );
  const comparison: [string, ReactNode, ReactNode, ReactNode][] = p
    ? [
        [
          "Games",
          number(p.games),
          number(c.games),
          `${signed(c.games - p.games)} · ${relative(c.games, p.games)}`,
        ],
        [
          `${review.pool} ending observation`,
          number(review.ratingPrevious.end),
          number(r.end),
          r.end != null && review.ratingPrevious.end != null
            ? `${signed(r.end - review.ratingPrevious.end)} rating points`
            : "—",
        ],
        [
          "Win rate",
          p.games ? percentage(p.winRate) : "—",
          c.games ? percentage(c.winRate) : "—",
          p.games && c.games
            ? `${signed(c.winRate - p.winRate, 1)} percentage points`
            : "—",
        ],
        [
          "Active days",
          number(p.activeDays),
          number(c.activeDays),
          `${signed(c.activeDays - p.activeDays)} days`,
        ],
        [
          "Recorded play time",
          p.time.withDuration
            ? formatDuration(p.time.totalRecordedSeconds)
            : "—",
          c.time.withDuration
            ? formatDuration(c.time.totalRecordedSeconds)
            : "—",
          p.time.withDuration && c.time.withDuration
            ? relative(c.time.totalRecordedSeconds, p.time.totalRecordedSeconds)
            : "—",
        ],
        [
          "Average session span",
          formatDuration(p.sessions.averageSessionSeconds),
          formatDuration(c.sessions.averageSessionSeconds),
          p.sessions.averageSessionSeconds != null &&
          c.sessions.averageSessionSeconds != null
            ? `${signed(c.sessions.averageSessionSeconds - p.sessions.averageSessionSeconds)} seconds`
            : "—",
        ],
        [
          "Observed rating movement",
          signed(review.ratingPrevious.change),
          signed(r.change),
          r.change != null && review.ratingPrevious.change != null
            ? `${signed(r.change - review.ratingPrevious.change)} rating points`
            : "—",
        ],
        ...(evidence.quality.analyzed && evidence.previousQuality.analyzed
          ? [
              [
                "Blunders / analyzed game",
                evidence.previousQuality.blundersPerGame?.toFixed(2) ?? "—",
                evidence.quality.blundersPerGame?.toFixed(2) ?? "—",
                `${signed(evidence.quality.blundersPerGame! - evidence.previousQuality.blundersPerGame!, 2)} per analyzed game`,
              ] as [string, ReactNode, ReactNode, ReactNode],
            ]
          : []),
      ]
    : [];
  return (
    <div className="ci-life-review">
      <div className="ci-filters ci-life-range">
        <Select
          label="Review period"
          value={selection.key}
          options={LIFE_REVIEW_RANGES.map(([k, label]) => [k, label])}
          onChange={(key) =>
            updateSelection({
              key: key as LifeRangeKey,
              ...(key === "custom" && !selection.start
                ? { start: range.start, end: range.end }
                : {}),
            })
          }
        />
        {selection.key === "custom" && (
          <>
            <label className="ci-field">
              From
              <input
                type="date"
                aria-label="Review start date"
                value={selection.start}
                max={localDate(now)}
                onChange={(e) => updateSelection({ start: e.target.value })}
              />
            </label>
            <label className="ci-field">
              To
              <input
                type="date"
                aria-label="Review end date"
                value={selection.end}
                min={selection.start || undefined}
                max={localDate(now)}
                onChange={(e) => updateSelection({ end: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      {range.error ? (
        <p className="ci-status" role="alert">
          {range.error}
        </p>
      ) : (
        <>
          <header className="ci-life-hero">
            <PeriodHeading
              kicker={`${range.label} · ${range.start} — ${range.end}`}
              title={insights.headline.title}
            >
              {insights.headline.detail}
            </PeriodHeading>
            <StatSummaryRow
              items={[
                ["Games", c.games],
                [
                  "Observed rating Δ",
                  signed(r.change),
                  `${review.pool} · ${number(r.start)} → ${number(r.end)}`,
                ],
                [
                  "Recorded play time",
                  c.time.withDuration
                    ? formatDuration(c.time.totalRecordedSeconds)
                    : "—",
                ],
                ["Win rate", c.games ? percentage(c.winRate) : "—"],
                ["Active days", `${c.activeDays} / ${c.totalDays}`],
              ]}
            />
            <p className="ci-note" role="status">
              {loadingHistory
                ? "Loading requested public archives; showing cached history as it arrives."
                : "Review of cached completed standard games."}{" "}
              Local timezone: {timezone()}. Uncached archives are absent; an
              empty comparison is not evidence of inactivity.
            </p>
          </header>
          <nav className="ci-life-jump" aria-label="Life Review topics">
            {[
              ["rating", "Rating"],
              ["activity", "Activity"],
              ["sessions", "Time & sessions"],
              ["compare", "Before vs now"],
              ["quality", "Quality"],
              ["repertoire", "Repertoire"],
              ["moments", "Moments"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() =>
                  document
                    .getElementById(`ci-life-${id}`)
                    ?.scrollIntoView({ behavior: "auto", block: "start" })
                }
              >
                {label}
              </button>
            ))}
          </nav>
          {!c.games ? (
            <Empty>
              No cached completed games in this period. Choose another range or
              refresh public history.
            </Empty>
          ) : (
            <>
              <section id="ci-life-rating" className="ci-life-block">
                <PeriodHeading
                  kicker="RATING JOURNEY"
                  title={
                    r.change != null &&
                    r.points.length >= 10 &&
                    Math.abs(r.change) >= 30
                      ? `Your ${review.pool} observations moved ${signed(r.change)} points`
                      : "Rating Journey"
                  }
                />
                <Select
                  label="Rating pool"
                  value={review.pool}
                  options={POOLS.map((pool) => [
                    pool,
                    pool[0].toUpperCase() + pool.slice(1),
                  ])}
                  onChange={(pool) =>
                    updateSelection({ pool: pool as TimeClass })
                  }
                />
                <Trend
                  label={`${review.pool} observed rating over completion time`}
                  baselineZero={false}
                  data={r.points.map((point) => ({
                    label: point.date,
                    position: point.game.endTime,
                    value: point.rating,
                    detail: `Change since previous observation ${signed(point.change)} · vs ${point.game.opponentUsername ?? "Unknown"} · ${point.game.result}`,
                  }))}
                  tall
                />
                <StatSummaryRow
                  items={[
                    ["Start → end", `${number(r.start)} → ${number(r.end)}`],
                    ["Period high", r.high],
                    ["Period low", r.low],
                    ["Largest drawdown", signed(r.drawdown)],
                  ]}
                />
                <p className="ci-note">
                  Archive ratings are pregame observations, ordered by
                  completion time. Movement between observations excludes an
                  unknown final postgame update. Daily games may overlap.
                  Drawdown is the greatest fall from an earlier period peak.
                </p>
                <div className="ci-life-inline-events">
                  {r.biggestGain && (
                    <span>
                      {r.biggestGain.date}: largest within-day observed gain{" "}
                      {signed(r.biggestGain.change)}
                    </span>
                  )}
                  {r.biggestLoss && (
                    <span>
                      {r.biggestLoss.date}: largest within-day observed loss{" "}
                      {signed(r.biggestLoss.change)}
                    </span>
                  )}
                </div>
              </section>
              <section id="ci-life-activity" className="ci-life-block">
                <PeriodHeading
                  kicker="ACTIVITY"
                  title={
                    busiest && c.games >= 20 && busiest.games / c.games >= 0.25
                      ? `${weekdays[busiest.weekday]} accounted for ${percentage((100 * busiest.games) / c.games)} of your games`
                      : "Activity over time"
                  }
                />
                <div className="ci-life-controls">
                  <SegmentedControl
                    label="Review calendar metric"
                    value={metric}
                    options={[
                      ["games", "Games"],
                      ["playTime", "Time Played"],
                      ["wins", "Wins"],
                    ]}
                    onChange={(value) => setMetric(value as HeatmapMetric)}
                  />
                  {calendarYears.length > 1 && (
                    <Select
                      label="Review calendar year"
                      value={String(shownYear)}
                      options={calendarYears.map(String)}
                      onChange={(v) => setCalendarYear(Number(v))}
                    />
                  )}
                </div>
                <ActivityHeatmap
                  key={`${range.start}:${range.end}:${shownYear}`}
                  games={review.games}
                  year={shownYear}
                  startDate={range.start}
                  endDate={range.end}
                  metric={metric}
                  durationRecords={durationRecords}
                  onDate={setDay}
                />
                <p className="ci-note">
                  Only the selected range contributes to this calendar. Cells
                  outside it are excluded, rather than evidence of inactivity.
                  Select a day for its game count.
                </p>
                {day && (
                  <p className="ci-status">
                    {day}: {c.days.find((d) => d.date === day)?.games ?? 0}{" "}
                    selected games ·{" "}
                    {formatDuration(
                      c.days.find((d) => d.date === day)?.seconds,
                    )}{" "}
                    recorded <button onClick={() => setDay("")}>Close</button>
                  </p>
                )}
                <Columns
                  label={
                    c.totalDays <= 62
                      ? "Games per local day"
                      : c.totalDays <= 370
                        ? "Games per selected week"
                        : "Games per month"
                  }
                  data={volume}
                />
                <StatSummaryRow
                  items={[
                    ["Active days", `${c.activeDays} / ${c.totalDays}`],
                    [
                      "Longest activity streak",
                      `${c.longestActiveStreak} days`,
                    ],
                    ["Longest inactive gap", `${c.longestInactiveGap} days`],
                  ]}
                />
              </section>
              <section id="ci-life-sessions" className="ci-life-block">
                <PeriodHeading
                  kicker="PLAYING TIME & SESSIONS"
                  title="When chess fitted into your days"
                />
                <StatSummaryRow
                  items={[
                    [
                      "Recorded game time",
                      c.time.withDuration
                        ? formatDuration(c.time.totalRecordedSeconds)
                        : "—",
                    ],
                    ["Sessions", c.sessions.totalSessions],
                    [
                      "Average session",
                      formatDuration(c.sessions.averageSessionSeconds),
                    ],
                    ["Median session", formatDuration(c.medianSessionSeconds)],
                    [
                      "Longest session",
                      formatDuration(
                        c.sessions.longestSession?.durationSeconds,
                      ),
                    ],
                    [
                      "Games / session",
                      number(c.sessions.averageGamesPerSession),
                    ],
                  ]}
                />
                <p className="ci-note">
                  Duration coverage {c.time.withDuration}/
                  {c.time.eligibleRealtimeGames} real-time games; exact interval
                  coverage {c.sessions.withIntervals}/{c.sessions.eligibleGames}
                  . Daily excluded. Sessions use the existing 30-minute gap
                  rule; span includes breaks. Full durations belong to games
                  completed in this range; games may start before its boundary.{" "}
                  {durationLoading
                    ? "Remaining game durations are being read locally."
                    : "Missing durations are unavailable, never estimated from nominal clocks."}
                </p>
                <div className="ci-two-columns">
                  <Panel title="Session span distribution">
                    <Bars rows={c.sessionBins.map((b) => [b.label, b.count])} />
                  </Panel>
                  <Panel title="Games by local hour">
                    <Columns
                      label="Game completions by local hour"
                      data={c.hours.map((h) => ({
                        label: String(h.hour).padStart(2, "0"),
                        value: h.games,
                      }))}
                    />
                  </Panel>
                </div>
                <Panel title="Session timeline">
                  <SessionTimeline sessions={c.sessions.sessions} />
                </Panel>
                <Panel title="Weekday × hour">
                  <SegmentedControl
                    label="Weekday hour metric"
                    value={matrixMetric}
                    options={[
                      ["games", "Games"],
                      ["time", "Recorded time"],
                    ]}
                    onChange={(v) => setMatrixMetric(v as "games" | "time")}
                  />
                  <WeekHourMatrix cells={c.hourCells} metric={matrixMetric} />
                  <p className="ci-note">
                    Games and recorded duration are assigned to the local hour
                    of completion. These are completion patterns, not exact time
                    spent inside each hourly bin.
                  </p>
                </Panel>
                <div className="ci-two-columns">
                  <Panel title="Games by weekday">
                    <Bars
                      rows={c.weekday.map((d) => [
                        weekdays[d.weekday],
                        d.games,
                        percentage(c.games ? (100 * d.games) / c.games : null),
                      ])}
                    />
                  </Panel>
                  <Panel title="Recorded time by day">
                    <Trend
                      label="Recorded game time by local day, minutes"
                      data={c.days.map((d) => ({
                        label: d.date,
                        value: !d.games
                          ? 0
                          : d.seconds == null
                            ? null
                            : d.seconds / 60,
                        detail: `${d.games} completed games · ${formatDuration(d.seconds)} recorded`,
                      }))}
                    />
                  </Panel>
                </div>
              </section>
              <section id="ci-life-compare" className="ci-life-block">
                <PeriodHeading
                  kicker="BEFORE VS NOW"
                  title="Results and changes in context"
                />
                <ResultComparison
                  current={c}
                  previous={p ?? undefined}
                  currentLabel={`${range.start} — ${range.end}`}
                  previousLabel={
                    range.previous
                      ? `${range.previous.start} — ${range.previous.end}`
                      : undefined
                  }
                />
                <p className="ci-note">{range.comparisonNote}</p>
                {comparison.length ? (
                  <div className="ci-table-scroll">
                    <table className="ci-table">
                      <caption className="ci-note">
                        Previous: {range.previous?.label}. Current {c.games}{" "}
                        games; previous {p?.games} games.
                      </caption>
                      <thead>
                        <tr>
                          {["Metric", "Previous", "Current", "Change"].map(
                            (h) => (
                              <th scope="col" key={h}>
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.map(([label, before, after, delta]) => (
                          <tr key={label}>
                            <th scope="row">{label}</th>
                            <td>{before}</td>
                            <td>{after}</td>
                            <td>{delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>
                    All Time has no equivalent preceding review period.
                  </Empty>
                )}
                {p && (
                  <p className="ci-note">
                    Duration coverage: current {c.time.withDuration}/
                    {c.time.eligibleRealtimeGames}, previous{" "}
                    {p.time.withDuration}/{p.time.eligibleRealtimeGames}.
                    Session intervals: current {c.sessions.withIntervals},
                    previous {p.sessions.withIntervals}. Changes in coverage can
                    affect time and engine comparisons.
                  </p>
                )}
                <div className="ci-two-columns">
                  <ChessSection title="What improved">
                    {insights.improved.length ? (
                      insights.improved.map((i) => (
                        <ChessSectionRow
                          key={i.title}
                          label={i.title}
                          value=""
                          detail={i.detail}
                        />
                      ))
                    ) : (
                      <Empty>
                        No change cleared the evidence and sample thresholds.
                      </Empty>
                    )}
                  </ChessSection>
                  <ChessSection title="What regressed">
                    {insights.regressed.length ? (
                      insights.regressed.map((i) => (
                        <ChessSectionRow
                          key={i.title}
                          label={i.title}
                          value=""
                          detail={i.detail}
                        />
                      ))
                    ) : (
                      <Empty>
                        No decline cleared the evidence and sample thresholds.
                      </Empty>
                    )}
                  </ChessSection>
                </div>
                <details className="ci-details">
                  <summary>How review conclusions are selected</summary>
                  <p className="ci-note">
                    Results require at least 10 games in each period (8 for
                    openings), a material change and separate 95% Wilson
                    intervals. These are descriptive comparisons, not causal
                    claims or adjustments for every group tested. Engine rates
                    describe the saved analyzed subset.{" "}
                    {insights.notes.join(" ")}
                  </p>
                </details>
              </section>
              <section id="ci-life-quality" className="ci-life-block">
                <PeriodHeading
                  kicker="PERFORMANCE QUALITY"
                  title="What the saved local analysis shows"
                />
                {analysis.error && (
                  <p className="ci-status" role="status">
                    Saved analysis unavailable: {analysis.error}
                  </p>
                )}
                {!analysis.loaded ? (
                  <p className="ci-muted" role="status">
                    Loading saved local analysis…
                  </p>
                ) : evidence.quality.analyzed ? (
                  <>
                    <StatSummaryRow
                      items={[
                        [
                          "Analyzed coverage",
                          `${evidence.quality.analyzed} / ${c.games}`,
                        ],
                        [
                          "Blunders / game",
                          evidence.quality.blundersPerGame?.toFixed(2),
                        ],
                        [
                          "Mistakes / game",
                          evidence.quality.mistakesPerGame?.toFixed(2),
                        ],
                        [
                          "Inaccuracies / game",
                          evidence.quality.inaccuraciesPerGame?.toFixed(2),
                        ],
                      ]}
                    />
                    <div className="ci-two-columns">
                      <Panel title="Saved errors by severity">
                        <Bars
                          rows={[
                            ["Blunders", evidence.quality.blunders],
                            ["Mistakes", evidence.quality.mistakes],
                            ["Inaccuracies", evidence.quality.inaccuracies],
                          ]}
                        />
                      </Panel>
                      <Panel title="Errors per analyzed game over time">
                        <Select
                          label="Local quality metric"
                          value={qualityMetric}
                          options={[
                            ["blunders", "Blunders"],
                            ["mistakes", "Mistakes"],
                            ["inaccuracies", "Inaccuracies"],
                          ]}
                          onChange={setQualityMetric}
                        />
                        <Trend
                          label={`${qualityMetric} per saved analyzed game, by month`}
                          data={evidence.quality.trend.map((t) => ({
                            label: t.period,
                            value: t.analyzed
                              ? t[
                                  qualityMetric as
                                    "blunders" | "mistakes" | "inaccuracies"
                                ] / t.analyzed
                              : null,
                            detail: `${t.analyzed} analyzed games · coverage is a selected subset`,
                          }))}
                        />
                      </Panel>
                    </div>
                  </>
                ) : (
                  <Empty>
                    No compatible saved engine analyses in this period. Analyze
                    completed games in Mistakes to add quality evidence.
                  </Empty>
                )}
                <p className="ci-note">
                  Compatible saved local analyses include games with zero
                  detected mistakes. This tab only reads them. Different
                  coverage and game selection can affect comparisons; these
                  heuristic error counts are not Chess.com accuracy.
                </p>
                <details className="ci-details">
                  <summary>Accuracy and rating vs quality</summary>
                  <Empty>
                    Real Chess.com accuracy is not present in the stored
                    public-game model. Accuracy averages, distributions, highest
                    accuracy highlights and correlation plots are unavailable.
                    No substitute accuracy score is generated. Evaluation
                    history is also insufficient to identify comebacks reliably.
                  </Empty>
                </details>
              </section>
              <section id="ci-life-repertoire" className="ci-life-block">
                <PeriodHeading
                  kicker="REPERTOIRE & MATCHUPS"
                  title="The games behind the averages"
                />
                <ChessSection title="Time controls">
                  <Bars
                    rows={evidence.pools.map((g) => [
                      g.label,
                      g.games,
                      `${percentage(g.games ? g.winRate : null)} wins · observed ${signed(g.observedChange)}`,
                    ])}
                  />
                  <GroupTable rows={evidence.pools} pools />
                </ChessSection>
                <div className="ci-two-columns">
                  <ChessSection title="White vs Black">
                    <Bars
                      rows={evidence.colors.map((g) => [
                        g.label,
                        g.winRate,
                        `${g.games} games`,
                      ])}
                      valueFormat={(v) => `${v.toFixed(1)}%`}
                    />
                    <GroupTable rows={evidence.colors} />
                    <p className="ci-note">
                      Color differences use wins, not estimated per-color rating
                      contributions. Small samples remain descriptive.
                    </p>
                  </ChessSection>
                  <ChessSection title="Opponent strength">
                    <Bars
                      rows={evidence.opponentBins.map((g) => [
                        g.label,
                        g.games,
                        `${percentage(g.games ? g.winRate : null)} wins · ${percentage(g.games ? g.score : null)} score`,
                      ])}
                    />
                    <GroupTable rows={evidence.opponentBins} />
                    <p className="ci-note">
                      Rating difference available for{" "}
                      {evidence.opponentsWithRatings}/{c.games} games. Score is
                      wins plus half of draws; it is not a performance rating.
                    </p>
                  </ChessSection>
                </div>
                <ChessSection title="Openings in this period">
                  <div className="ci-life-controls">
                    <SegmentedControl
                      label="Review opening color"
                      value={openingColor}
                      options={[
                        ["all", "All Games"],
                        ["white", "White openings"],
                        ["black", "Black defenses"],
                      ]}
                      onChange={setOpeningColor}
                    />
                  </div>
                  {openingRows.length ? (
                    <>
                      <Bars
                        rows={openingRows
                          .slice(0, 8)
                          .map((o) => [
                            o.label,
                            o.games,
                            `${percentage(o.games ? o.winRate : null)} wins`,
                          ])}
                      />
                      <div className="ci-table-scroll">
                        <table className="ci-table">
                          <caption className="ci-note">
                            Known openings only; at least 8 games for frequent
                            rankings. Accuracy and per-opening postgame rating
                            contribution are unavailable.
                          </caption>
                          <thead>
                            <tr>
                              {[
                                "Opening / color",
                                "Games",
                                "Win %",
                                "Avg opponent",
                                "Previous games",
                                "Usage change",
                              ].map((h) => (
                                <th scope="col" key={h}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {openingRows.slice(0, 20).map((o) => (
                              <tr key={o.key}>
                                <th scope="row">{o.label}</th>
                                <td>{o.games}</td>
                                <td>
                                  {percentage(o.games ? o.winRate : null)}
                                </td>
                                <td>{number(o.avgOpponent)}</td>
                                <td>{o.previousGames}</td>
                                <td>
                                  {relative(o.games, o.previousGames)}
                                  <small>
                                    {signed(o.usageChange, 1)} pp of all games
                                  </small>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="ci-note">
                        Most used: {favorite}. Frequent highest win rate:{" "}
                        {evidence.bestFrequent?.label ?? "Insufficient sample"};
                        frequent lowest:{" "}
                        {evidence.worstFrequent?.label ?? "Insufficient sample"}
                        . Rows with fewer than 8 games do not support
                        performance conclusions. Showing the 20 most used known
                        openings.
                      </p>
                    </>
                  ) : (
                    <Empty>
                      No known openings for this color in the selected period.
                    </Empty>
                  )}
                </ChessSection>
              </section>
              <section id="ci-life-moments" className="ci-life-block">
                <PeriodHeading
                  kicker="PERSONAL CHESS HISTORY"
                  title="Moments worth revisiting"
                />
                <div className="ci-two-columns">
                  <ChessSection title="Best moments">
                    <MomentRows
                      moments={moments.best}
                      empty="No supported highlights in this sample."
                    />
                  </ChessSection>
                  <ChessSection title="Tough moments">
                    <MomentRows
                      moments={moments.tough}
                      empty="No supported tough moments in this sample."
                    />
                  </ChessSection>
                </div>
                <StatSummaryRow
                  items={[
                    ["Longest winning streak", c.streaks.win.length],
                    ["Longest unbeaten streak", c.streaks.unbeaten.length],
                    ["Longest losing streak", c.streaks.loss.length],
                    ["Active-day streak", c.longestActiveStreak],
                  ]}
                />
                {c.streaks.win.length >= 3 && (
                  <div
                    className="ci-life-streak"
                    aria-label={`${c.streaks.win.length} consecutive wins`}
                  >
                    <span>
                      Notable winning run · {c.streaks.win.games[0]?.localDate}
                    </span>
                    {c.streaks.win.games.slice(0, 24).map((g) => (
                      <span
                        key={g.id}
                        className="ci-positive"
                        title={`${g.localDate} · vs ${g.opponentUsername ?? "Unknown"}`}
                      >
                        W
                      </span>
                    ))}
                    {c.streaks.win.length > 24 && (
                      <span>+{c.streaks.win.length - 24} wins</span>
                    )}
                  </div>
                )}
                <ChessSection title="Chess Life Timeline">
                  <MomentRows
                    moments={moments.timeline}
                    empty="More completed games are needed for a meaningful timeline."
                  />
                </ChessSection>
              </section>
              <section className="ci-life-block">
                <PeriodHeading
                  kicker="CONSISTENCY"
                  title="Your rhythm, without an artificial score"
                />
                <StatSummaryRow
                  items={[
                    [
                      "Active / calendar days",
                      `${c.activeDays} / ${c.totalDays}`,
                    ],
                    [
                      "Median games / active day",
                      number(c.medianGamesPerActiveDay),
                    ],
                    [
                      "Games / day variance",
                      varianceValue(c.varianceGamesPerDay),
                    ],
                    [
                      "Recorded hours / day variance",
                      c.varianceSecondsPerDay == null
                        ? "—"
                        : varianceValue(c.varianceSecondsPerDay / 3600 ** 2),
                    ],
                  ]}
                />
                <Bars
                  rows={[
                    ["1 game", c.days.filter((d) => d.games === 1).length],
                    [
                      "2–4 games",
                      c.days.filter((d) => d.games >= 2 && d.games <= 4).length,
                    ],
                    [
                      "5–9 games",
                      c.days.filter((d) => d.games >= 5 && d.games <= 9).length,
                    ],
                    ["10+ games", c.days.filter((d) => d.games >= 10).length],
                  ]}
                />
                <p className="ci-note">
                  Game variance includes inactive calendar days. Time variance
                  uses days with recorded time plus inactive days; days with
                  missing duration are excluded. The current day may still be in
                  progress.
                </p>
              </section>
              {(selection.key === "year" || selection.key === "lastYear") && (
                <section className="ci-life-block">
                  <PeriodHeading
                    kicker="YEAR AT A GLANCE"
                    title="A year seen month by month"
                  />
                  <div className="ci-two-columns">
                    <Panel title="Games by month">
                      <Columns
                        label="Games by selected month"
                        data={c.monthly.map((m) => ({
                          label: m.month.slice(5),
                          value: m.games,
                        }))}
                      />
                    </Panel>
                    <Panel title="Recorded time by month">
                      <Trend
                        label="Recorded hours by month"
                        data={c.monthly.map((m) => ({
                          label: m.month.slice(5),
                          value: m.seconds == null ? null : m.seconds / 3600,
                        }))}
                      />
                    </Panel>
                    <Panel title={`${review.pool} monthly observations`}>
                      <Trend
                        baselineZero={false}
                        label="Last observed rating each month"
                        data={c.monthly.map((m) => ({
                          label: m.month.slice(5),
                          value: m.rating,
                        }))}
                      />
                    </Panel>
                    <Panel title="Win rate by month">
                      <Trend
                        percent
                        label="Win percentage by month"
                        data={c.monthly.map((m) => ({
                          label: m.month.slice(5),
                          value: m.games ? m.winRate : null,
                          detail: `${m.games} games`,
                        }))}
                      />
                    </Panel>
                  </div>
                  <ChessSection title="Month highlights">
                    {[...c.monthly]
                      .filter((m) => m.games)
                      .sort((a, b) => b.games - a.games)
                      .slice(0, 1)
                      .map((m) => (
                        <ChessSectionRow
                          key={m.month}
                          label="Most active month"
                          value={`${m.games} games`}
                          detail={m.month}
                        />
                      ))}
                    {[...c.monthly]
                      .filter((m) => m.change != null && m.change > 0)
                      .sort((a, b) => b.change! - a.change!)
                      .slice(0, 1)
                      .map((m) => (
                        <ChessSectionRow
                          key={m.month}
                          label={`Largest within-month observed gain · ${review.pool}`}
                          value={`${signed(m.change)} points`}
                          detail={m.month}
                        />
                      ))}
                  </ChessSection>
                </section>
              )}
              <LifeReviewShareCard
                username={username}
                period={`${range.label} · ${range.start} — ${range.end}`}
                headline={insights.headline.title}
                games={c.games}
                winRate={c.winRate}
                observedChange={r.change}
                pool={review.pool}
                timeSeconds={
                  c.time.withDuration ? c.time.totalRecordedSeconds : null
                }
                activeDays={c.activeDays}
                opening={favorite}
                theme={theme}
                coverage={`${c.time.withDuration}/${c.time.eligibleRealtimeGames} real-time games with duration · ${evidence.quality.analyzed}/${c.games} analyzed`}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
