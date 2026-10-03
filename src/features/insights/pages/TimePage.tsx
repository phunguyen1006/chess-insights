import { useEffect, useMemo, useState } from "react";
import type { GameDurationRecord } from "../../../analysis/playTime";
import {
  playTimeSummary,
  sessionAnalytics,
  type PlayTimeSummary,
  type SessionAnalytics,
} from "../../../analytics/playTime";
import { displayDate, localDate } from "../../../shared/dates";
import {
  ChessSection,
  ChessSectionRow,
  StatSummaryRow,
  SecondarySidebar,
  SegmentedControl,
  PoolIcon,
  formatDuration,
  percentage,
  ratingDelta,
} from "../components/NativeStats";
import type { NormalizedGame } from "../../../shared/types";
import { useAnalysis, analysisDebug } from "../../state/useAnalysis";
import { timeAnalytics, mean, median } from "../../../analysis/timeAnalytics";
import { longThinkThreshold } from "../../../analysis/clocks";
import { Panel, Bars, Select, number, Empty } from "../components/Common";
import { Trend } from "../components/Charts";
function ClockUsage({
  games,
  onTimeout,
  analysis,
}: {
  games: NormalizedGame[];
  onTimeout: () => void;
  analysis: ReturnType<typeof useAnalysis>;
}) {
  const { state, error, progress, request } = analysis;
  const [selected, setSelected] = useState(""),
    [outcome, setOutcome] = useState("all");
  const t = useMemo(() => timeAnalytics(games, state), [games, state]);
  const curve = useMemo(
    () =>
      timeAnalytics(
        outcome === "all" ? games : games.filter((g) => g.result === outcome),
        state,
      ),
    [games, state, outcome],
  );
  analysisDebug.time = {
    totalGames: games.length,
    realTimeGames: t.real.length,
    gamesWithClockData: t.records.length,
    coverage: t.coverage,
  };
  const pct = (n: number, d: number) =>
    d ? `${((100 * n) / d).toFixed(1)}%` : "—";
  const selectedRecord =
    t.records.find((r) => r.game.id === selected) ?? t.records.at(-1);
  return (
    <>
      <p className="ci-status" role="status">
        {progress < games.length
          ? `Analyzing clock data ${progress} / ${games.length} · `
          : ""}
        Clock data available for {pct(t.records.length, t.real.length)} of
        selected real-time games ({t.records.length} / {t.real.length}).{" "}
        {games.length} total selected; Daily excluded.
      </p>
      {error && (
        <p className="ci-status">
          {error}{" "}
          <button
            onClick={() =>
              void request("clocks", { ids: games.map((g) => g.id) }).catch(
                () => undefined,
              )
            }
          >
            Retry
          </button>
        </p>
      )}
      <StatSummaryRow
        items={[
          ["Average Move Time", formatDuration(t.average)],
          ["Median Move Time", formatDuration(t.median)],
          [
            "Your Thinking Time / Game",
            formatDuration(t.used),
            "Complete observed user-move intervals",
          ],
          [
            "Clock Coverage",
            pct(t.records.length, t.real.length),
            t.records.length + " / " + t.real.length + " games",
          ],
        ]}
      />
      <button onClick={onTimeout}>Timeout losses → Results</button>
      {!t.times.length ? (
        <Empty>No move-time data is available for the selected games.</Empty>
      ) : (
        <>
          <Panel title="Clock remaining by move">
            <SegmentedControl
              label="Curve outcome"
              value={outcome}
              options={[
                ["all", "All Games"],
                ["win", "Wins"],
                ["loss", "Losses"],
              ]}
              onChange={setOutcome}
            />
            <Trend
              tall
              data={curve.clockCurve}
              label="Average remaining clock as percent of starting time"
            />
            <p className="ci-note">
              Percent of base clock, not effective clock. Increments can produce
              values above 100%. Null observations leave gaps.
            </p>
          </Panel>
          <div className="ci-two-columns">
            <Panel title="Move-time distribution">
              <Bars rows={t.distribution} />
            </Panel>
            <Panel title="Thinking time by phase">
              <Bars
                rows={["opening", "middlegame", "endgame"].flatMap((phase) => {
                  const a = t.records.flatMap((r) =>
                    r.moves
                      .filter(
                        (m) => m.phase === phase && m.thinkSeconds !== null,
                      )
                      .map((m) => m.thinkSeconds!),
                  );
                  return a.length
                    ? [
                        [
                          phase,
                          mean(a)!,
                          a.length + " timed moves · seconds",
                        ] as [string, number, string],
                      ]
                    : [];
                })}
              />
            </Panel>
          </div>
          <Panel title="Average think time by move number">
            <Trend data={t.thinkCurve} label="Average think time in seconds" />
            <p className="ci-note">
              Moves 1–60 separately; later moves combined. Tooltips include
              observation counts.
            </p>
          </Panel>
          <Panel title="Rapid vs Blitz vs Bullet">
            <div className="ci-pool-comparison">
              {["rapid", "blitz", "bullet"].map((pool) => {
                const rows = t.records.filter((r) => r.game.timeClass === pool),
                  times = rows.flatMap((r) => r.times);
                return (
                  <div key={pool}>
                    <h4>{pool} · seconds</h4>
                    {times.length ? (
                      <Bars
                        compact
                        rows={[
                          ["Mean", mean(times)!],
                          ["Median", median(times)!],
                        ]}
                      />
                    ) : (
                      <Empty>No timed games.</Empty>
                    )}
                    <p className="ci-note">{rows.length} clock-covered games</p>
                  </div>
                );
              })}
            </div>
            <div className="ci-table-scroll">
              <table className="ci-table">
                <thead>
                  <tr>
                    {[
                      "Pool",
                      "Clock games",
                      "Mean",
                      "Median",
                      "Pressure",
                      "Timeout losses",
                      "Moves under 2s",
                      "Long thinks",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["rapid", "blitz", "bullet"].map((pool) => {
                    const r = t.records.filter(
                        (r) => r.game.timeClass === pool,
                      ),
                      a = r.flatMap((r) => r.times),
                      all = t.real.filter((g) => g.timeClass === pool),
                      long = r.filter((r) => r.long.length);
                    return (
                      <tr key={pool}>
                        <td>{pool}</td>
                        <td>
                          {r.length} / {all.length}
                        </td>
                        <td>{formatDuration(mean(a))}</td>
                        <td>{formatDuration(median(a))}</td>
                        <td>
                          {pct(r.filter((r) => r.pressure).length, r.length)}
                        </td>
                        <td>
                          {pct(
                            all.filter(
                              (g) =>
                                g.result === "loss" &&
                                g.termination === "Timeout",
                            ).length,
                            all.length,
                          )}
                        </td>
                        <td>{pct(a.filter((n) => n < 2).length, a.length)}</td>
                        <td>
                          {r.reduce((s, r) => s + r.long.length, 0)} ·{" "}
                          {pct(
                            long.filter((r) => r.game.result === "win").length,
                            long.length,
                          )}{" "}
                          game win rate
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="ci-note">
              Long think: max(3s, min(30s, base / 20)). Time used/game requires
              every user move to have a valid interval. Speed and outcomes
              describe observations, not causes.
            </p>
          </Panel>
          <Panel title="Observed patterns">
            {["rapid", "blitz", "bullet"].map((pool) => {
              const r = t.records.filter((r) => r.game.timeClass === pool),
                a = r.flatMap((r) => r.times);
              return a.length ? (
                <p key={pool}>
                  {pct(a.filter((n) => n < 2).length, a.length)} of your {pool}{" "}
                  timed moves take under 2 seconds.{" "}
                  {pct(r.filter((r) => r.pressure).length, r.length)} of
                  clock-covered games enter pressure. Long-think thresholds vary
                  by clock (for example{" "}
                  {number(longThinkThreshold(r[0].clock.baseSeconds))}s).
                </p>
              ) : null;
            })}
          </Panel>
          <Panel title="Historical game timing">
            <Select
              label="Completed game"
              value={selectedRecord?.game.id ?? ""}
              options={[...t.records]
                .reverse()
                .map((r) => [
                  r.game.id,
                  `${r.game.localDate} · ${r.game.opponentUsername} · ${r.game.timeControl} · ${r.game.result}`,
                ])}
              onChange={setSelected}
            />
            {selectedRecord && (
              <>
                <a
                  href={selectedRecord.game.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Game →
                </a>
                <div className="ci-table-scroll ci-move-table">
                  <table className="ci-table">
                    <thead>
                      <tr>
                        <th>Move</th>
                        <th>SAN</th>
                        <th>Think time</th>
                        <th>Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecord.moves.map((m) => (
                        <tr key={m.ply}>
                          <td>{m.moveNumber}</td>
                          <td>{m.san}</td>
                          <td>
                            {m.thinkSeconds === null
                              ? "Unknown"
                              : formatDuration(m.thinkSeconds)}
                          </td>
                          <td>
                            {m.remainingSeconds === null
                              ? "Unknown"
                              : formatDuration(m.remainingSeconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        </>
      )}
      <p className="ci-note">
        Opening: first 10 full moves. Later positions are endgames when ≤4
        non-pawn pieces remain, or no queens and ≤8 non-pawn pieces; all others
        are middlegame. Kings excluded. Unknown clock intervals are excluded
        from timing averages.
      </p>
    </>
  );
}

const timeViews: [string, string][] = [
  ["overview", "Overview"],
  ["play-time", "Play Time"],
  ["clock-usage", "Clock Usage"],
  ["time-pressure", "Time Pressure"],
  ["sessions", "Sessions"],
];
const realtimePools = ["rapid", "blitz", "bullet"] as const;
const poolName = (pool: string) => pool[0].toUpperCase() + pool.slice(1);
const coverage = (known: number, eligible: number) =>
  eligible ? percentage((100 * known) / eligible) : "—";
function readTimeView() {
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const value = params.get("timeView") ?? "overview";
  return timeViews.some(([id]) => id === value) ? value : "overview";
}
function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}
function playTimeLabel(summary: PlayTimeSummary) {
  return summary.eligibleRealtimeGames > 0 &&
    summary.withDuration === summary.eligibleRealtimeGames
    ? "Total Play Time"
    : "Recorded Play Time";
}
function DurationCoverage({ summary }: { summary: PlayTimeSummary }) {
  return (
    <p className="ci-note" data-scope="duration-coverage">
      Based on {number(summary.withDuration)} /{" "}
      {number(summary.eligibleRealtimeGames)} eligible real-time games ·{" "}
      {coverage(summary.withDuration, summary.eligibleRealtimeGames)} duration
      coverage. Daily games excluded from Play Time
      {summary.dailyExcluded
        ? ` (${number(summary.dailyExcluded)} selected)`
        : ""}
      .
    </p>
  );
}
function PlayTimeTrend({ summary }: { summary: PlayTimeSummary }) {
  const finalMonth = summary.byMonth.at(-1)?.month;
  const last = finalMonth ? new Date(`${finalMonth}-01T12:00:00`) : new Date();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(last.getFullYear(), last.getMonth() - 11 + index, 1);
    const key = localDate(date).slice(0, 7);
    const month = summary.byMonth.find((row) => row.month === key);
    return {
      label: monthLabel(key),
      value: month?.games ? month.durationSeconds / 3600 : null,
      detail: month
        ? `${formatDuration(month.games ? month.durationSeconds : null)} recorded · ${number(month.games)} / ${number(month.eligibleGames)} games · average ${formatDuration(month.averageDurationSeconds)} · ${coverage(month.games, month.eligibleGames)} coverage`
        : "No selected real-time game observations",
    };
  });
  return (
    <Panel title="Play Time · Last 12 Months">
      <Trend
        tall
        area
        label="Recorded play-time hours by month"
        data={months}
      />
      <p className="ci-note">
        Hours from completed real-time games in the selected period. Months
        without known durations leave gaps; missing time is not counted as zero.
      </p>
    </Panel>
  );
}
function PlayHighlights({
  summary,
  sessions,
}: {
  summary: PlayTimeSummary;
  sessions: SessionAnalytics;
}) {
  const {
      mostTimeDay: day,
      mostGamesDay: busy,
      mostTimeMonth: month,
      longestGame: longest,
    } = summary.highlights,
    longestSession = sessions.longestSession;
  return (
    <ChessSection title="Play Time Highlights">
      <ChessSectionRow
        label="Most Time in One Day"
        value={formatDuration(day?.durationSeconds)}
        detail={day ? `${displayDate(day.date)} · recorded time` : undefined}
      />
      <ChessSectionRow
        label="Longest Game"
        value={formatDuration(longest?.record.durationSeconds)}
        detail={
          longest
            ? `${displayDate(longest.game.localDate)} · vs ${longest.game.opponentUsername ?? "Unknown"}`
            : undefined
        }
        href={longest?.game.url || undefined}
      />
      <ChessSectionRow
        label="Most Games in One Day"
        value={busy ? number(busy.eligibleGames) : "—"}
        detail={busy ? displayDate(busy.date) : undefined}
      />
      <ChessSectionRow
        label="Longest Session"
        value={formatDuration(longestSession?.durationSeconds)}
        detail={
          longestSession
            ? `${displayDate(localDate(new Date(longestSession.startTimestamp)))} · ${number(longestSession.games)} games · includes breaks`
            : "Requires observed start and end timestamps"
        }
      />
      <ChessSectionRow
        label="Most Time in One Month"
        value={formatDuration(month?.durationSeconds)}
        detail={
          month ? `${monthLabel(month.month)} · recorded time` : undefined
        }
      />
    </ChessSection>
  );
}
function PlayTimeDetails({
  games,
  records,
  summary,
  sessions,
}: {
  games: NormalizedGame[];
  records: GameDurationRecord[];
  summary: PlayTimeSummary;
  sessions: SessionAnalytics;
}) {
  const [pool, setPool] = useState("all");
  const distribution = useMemo(
    () =>
      playTimeSummary(
        pool === "all"
          ? games
          : games.filter((game) => game.timeClass === pool),
        records,
      ).distribution,
    [games, records, pool],
  );
  return (
    <>
      <ChessSection title="Time by Control">
        {summary.byControl.map((row) => (
          <ChessSectionRow
            key={row.pool}
            label={
              <>
                <PoolIcon pool={row.pool} /> {poolName(row.pool)}
              </>
            }
            value={formatDuration(row.games ? row.durationSeconds : null)}
            detail={`${summary.totalRecordedSeconds ? percentage(row.share * 100) : "—"} share · ${number(row.games)} / ${number(row.eligibleGames)} games`}
          />
        ))}
        {summary.withDuration > 0 && (
          <Bars
            valueFormat={formatDuration}
            rows={summary.byControl
              .filter((row) => row.games)
              .map((row) => [
                poolName(row.pool),
                row.durationSeconds,
                `${percentage(row.share * 100)} share of recorded play time`,
              ])}
          />
        )}
      </ChessSection>
      <ChessSection title="Average Game Duration">
        <ChessSectionRow
          label="All Real-time Games"
          value={formatDuration(summary.averageDurationSeconds)}
          detail={`${number(summary.withDuration)} known durations`}
        />
        {summary.byControl.map((row) => (
          <ChessSectionRow
            key={row.pool}
            label={poolName(row.pool)}
            value={formatDuration(row.averageDurationSeconds)}
            detail={`${number(row.games)} known durations · ${coverage(row.games, row.eligibleGames)} coverage`}
          />
        ))}
      </ChessSection>
      <Panel title="Game Duration Distribution">
        <SegmentedControl
          label="Duration time control"
          value={pool}
          options={[
            ["all", "All Games"],
            ...realtimePools.map((value): [string, string] => [
              value,
              poolName(value),
            ]),
          ]}
          onChange={setPool}
        />
        {distribution.some((row) => row.count) ? (
          <Bars
            rows={distribution.map((row) => [
              row.label,
              row.count,
              "games with known duration",
            ])}
          />
        ) : (
          <Empty>No known game durations for this control.</Empty>
        )}
      </Panel>
      <ChessSection title="Longest Games">
        {summary.longestGames.length ? (
          <div className="ci-table-scroll">
            <table className="ci-table">
              <thead>
                <tr>
                  {["Date", "Opponent", "Control", "Duration", "Game"].map(
                    (label) => (
                      <th key={label}>{label}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.longestGames.map(({ game, record }) => (
                  <tr key={game.id}>
                    <td>{displayDate(game.localDate)}</td>
                    <td>{game.opponentUsername ?? "Unknown"}</td>
                    <td>
                      {poolName(game.timeClass)} · {game.timeControl}
                    </td>
                    <td>{formatDuration(record.durationSeconds)}</td>
                    <td>
                      {game.url ? (
                        <a
                          href={game.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open Game →
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No known game durations in this period.</Empty>
        )}
      </ChessSection>
      <PlayHighlights summary={summary} sessions={sessions} />
    </>
  );
}
function TimePressure({
  games,
  analysis,
  onTimeout,
}: {
  games: NormalizedGame[];
  analysis: ReturnType<typeof useAnalysis>;
  onTimeout: () => void;
}) {
  const { state } = analysis,
    t = useMemo(() => timeAnalytics(games, state), [games, state]);
  const at20 = t.records.flatMap((row) => {
      const value = row.moves.find(
        (move) => move.moveNumber === 20,
      )?.remainingSeconds;
      return value == null ? [] : [value];
    }),
    selectedIds = new Set(games.map((game) => game.id)),
    mistakes = state.mistakes.filter((mistake) =>
      selectedIds.has(mistake.gameId),
    ),
    timed = mistakes.filter((mistake) => mistake.inPressure !== null),
    pressured = timed.filter((mistake) => mistake.inPressure),
    entries = Array.from({ length: 61 }, (_, i) => ({
      label: i === 60 ? "61+" : String(i + 1),
      value: t.pressure.filter((row) =>
        i === 60
          ? row.pressure!.moveNumber > 60
          : row.pressure!.moveNumber === i + 1,
      ).length,
      detail: "first observed pressure entries",
    }));
  return (
    <>
      <div className="ci-primary-stat">
        <span>Games in Time Pressure</span>
        <strong>{number(t.pressure.length)}</strong>
        <p className="ci-note">
          {coverage(t.pressure.length, t.records.length)} of{" "}
          {number(t.records.length)} clock-covered games. Clock coverage:{" "}
          {number(t.records.length)} / {number(t.real.length)} selected
          real-time games.
        </p>
      </div>
      <StatSummaryRow
        items={[
          [
            "Win Rate after Entry",
            coverage(
              t.pressure.filter((row) => row.game.result === "win").length,
              t.pressure.length,
            ),
          ],
          [
            "Average Entry Move",
            number(mean(t.pressure.map((row) => row.pressure!.moveNumber))),
          ],
          [
            "Clock at Move 20",
            formatDuration(mean(at20)),
            `${number(at20.length)} observations`,
          ],
          [
            "Timeout Loss after Entry",
            coverage(
              t.pressure.filter(
                (row) =>
                  row.game.result === "loss" &&
                  row.game.termination === "Timeout",
              ).length,
              t.pressure.length,
            ),
          ],
        ]}
      />
      <Panel title="Time Pressure Entry">
        <Trend
          tall
          data={t.records.length ? entries : []}
          label="Games entering time pressure by move number"
        />
        <p className="ci-note">
          Pressure begins below min(30 seconds, 10% of base clock). Entry is
          observed after a move; missing clocks can hide earlier entry.
        </p>
      </Panel>
      <ChessSection title="Time Pressure Statistics">
        <ChessSectionRow
          label="Timeout Losses"
          value={
            <button type="button" onClick={onTimeout}>
              {number(t.timeoutLosses.length)} → Results
            </button>
          }
          detail="All selected real-time games, including games without clocks"
        />
        <ChessSectionRow
          label="Games with Clock Data"
          value={`${number(t.records.length)} / ${number(t.real.length)}`}
          detail={`${coverage(t.records.length, t.real.length)} clock coverage`}
        />
      </ChessSection>
      <ChessSection title="Mistakes and Time Pressure">
        <ChessSectionRow
          label="Mistakes in Pressure"
          value={`${number(pressured.length)} / ${number(timed.length)}`}
          detail={`${coverage(pressured.length, timed.length)} of mistakes with clock context`}
        />
        <ChessSectionRow
          label="Blunders in Pressure"
          value={number(
            pressured.filter((mistake) => mistake.severity === "blunder")
              .length,
          )}
        />
        <ChessSectionRow
          label="Analyzed Games"
          value={number(
            state.analyses.filter((record) => selectedIds.has(record.id))
              .length,
          )}
          detail={`Clock context for ${number(timed.length)} / ${number(mistakes.length)} mistakes. These observations describe associations.`}
        />
      </ChessSection>
    </>
  );
}
function SessionDetails({ summary }: { summary: SessionAnalytics }) {
  const [limit, setLimit] = useState(20);
  return (
    <>
      <div className="ci-primary-stat">
        <span>Sessions</span>
        <strong>{number(summary.totalSessions)}</strong>
        <p className="ci-note" data-scope="session-coverage">
          Reconstructed from {number(summary.withIntervals)} /{" "}
          {number(summary.eligibleGames)} eligible real-time games ·{" "}
          {coverage(summary.withIntervals, summary.eligibleGames)} session
          coverage. A new session starts after a gap longer than{" "}
          {summary.sessionGapMinutes} minutes.
        </p>
      </div>
      <p className="ci-note">
        Sessions require observed start and end timestamps. Clock-only durations
        cannot establish an interval; missing intervals separate sessions.
        Session length includes breaks between games.
      </p>
      <StatSummaryRow
        items={[
          ["Average Session", formatDuration(summary.averageSessionSeconds)],
          ["Games / Session", number(summary.averageGamesPerSession)],
          [
            "Longest Session",
            formatDuration(summary.longestSession?.durationSeconds),
          ],
          ["Most Games / Session", number(summary.maxGamesPerSession)],
        ]}
      />
      <Panel title="Session Length Over Time">
        <Trend
          tall
          area
          label="Session length over time in minutes"
          data={summary.sessions.map((session) => ({
            label: displayDate(localDate(new Date(session.startTimestamp))),
            value: session.durationSeconds / 60,
            detail: `${formatDuration(session.durationSeconds)} session · ${formatDuration(session.recordedSeconds)} recorded game time · ${number(session.games)} games · ${session.wins} W / ${session.draws} D / ${session.losses} L`,
          }))}
        />
      </Panel>
      <ChessSection title="Session Highlights">
        <ChessSectionRow
          label="Longest Session"
          value={formatDuration(summary.longestSession?.durationSeconds)}
          detail={
            summary.longestSession
              ? `${displayDate(localDate(new Date(summary.longestSession.startTimestamp)))} · ${number(summary.longestSession.games)} games`
              : undefined
          }
        />
        <ChessSectionRow
          label="Most Games in One Session"
          value={number(summary.maxGamesPerSession)}
        />
        {realtimePools.map((pool) => (
          <ChessSectionRow
            key={pool}
            label={`${poolName(pool)} Average Observed Rating Change / Session`}
            value={ratingDelta(summary.averageRatingChangeByPool[pool])}
            detail="Consecutive observed ratings within the same session and pool; not guaranteed post-game change"
          />
        ))}
      </ChessSection>
      <Panel title="Performance by Game Number in Session">
        <Trend
          percent
          label="Observed win rate by game number in session"
          data={summary.performanceByGameNumber.map((row) => ({
            label: row.gameNumber === 7 ? "Game 7+" : `Game ${row.gameNumber}`,
            value: row.winRate * 100,
            detail: `${number(row.games)} games · ${row.wins} W / ${row.draws} D / ${row.losses} L`,
          }))}
        />
        <p className="ci-note">
          Observed results by position in the session. Later game numbers can
          have fewer samples; these patterns do not establish fatigue or
          causality.
        </p>
      </Panel>
      <Panel title="Session Duration Distribution">
        {summary.totalSessions ? (
          <Bars
            rows={summary.distribution.map((row) => [
              row.label,
              row.count,
              "reconstructed sessions",
            ])}
          />
        ) : (
          <Empty>
            No reliable sessions can be reconstructed for this period.
          </Empty>
        )}
      </Panel>
      <ChessSection title="Recent Sessions">
        {summary.totalSessions ? (
          <>
            <div className="ci-table-scroll">
              <table className="ci-table">
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Session Length",
                      "Recorded Time",
                      "Games",
                      "W / D / L",
                      "Controls",
                      "Observed Rating Change",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...summary.sessions]
                    .reverse()
                    .slice(0, limit)
                    .map((session) => (
                      <tr key={session.id}>
                        <td>
                          {new Date(session.startTimestamp).toLocaleString()}
                        </td>
                        <td>{formatDuration(session.durationSeconds)}</td>
                        <td>{formatDuration(session.recordedSeconds)}</td>
                        <td>{number(session.games)}</td>
                        <td>
                          {session.wins} / {session.draws} / {session.losses}
                        </td>
                        <td>{session.timeControls.map(poolName).join(", ")}</td>
                        <td>
                          {realtimePools
                            .filter(
                              (pool) =>
                                session.ratingChangeByPool[pool] !== undefined,
                            )
                            .map(
                              (pool) =>
                                `${poolName(pool)} ${ratingDelta(session.ratingChangeByPool[pool])}`,
                            )
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {limit < summary.sessions.length && (
              <button
                type="button"
                onClick={() => setLimit((value) => value + 20)}
              >
                Show More Sessions
              </button>
            )}
          </>
        ) : (
          <Empty>No games with reliable observed intervals.</Empty>
        )}
      </ChessSection>
    </>
  );
}
export function TimePage({
  username,
  games,
  ratingSource = games,
  onTimeout,
  version = 0,
  durationRecords = [],
}: {
  username: string;
  games: NormalizedGame[];
  ratingSource?: NormalizedGame[];
  onTimeout: () => void;
  version?: number;
  durationRecords?: GameDurationRecord[];
  durationLoading?: boolean;
  durationProcessed?: number;
  durationTotal?: number;
}) {
  const analysis = useAnalysis(username, games, true, version),
    [view, setView] = useState(readTimeView),
    clock = useMemo(
      () => timeAnalytics(games, analysis.state),
      [games, analysis.state],
    ),
    duration = useMemo(
      () => playTimeSummary(games, durationRecords),
      [games, durationRecords],
    ),
    sessions = useMemo(
      () => sessionAnalytics(games, durationRecords, undefined, ratingSource),
      [games, durationRecords, ratingSource],
    );
  useEffect(() => {
    const update = () => setView(readTimeView());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const changeView = (value: string) => {
    setView(value);
    const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
    params.set("timeView", value);
    location.hash = `chess-insights/time?${params.toString()}`;
  };
  analysisDebug.time = {
    totalGames: games.length,
    realTimeGames: clock.real.length,
    gamesWithClockData: clock.records.length,
    coverage: clock.coverage,
  };
  return (
    <div className="ci-advanced-layout" data-scope="time-analytics">
      <SecondarySidebar
        label="Time statistics"
        value={view}
        items={timeViews}
        onChange={changeView}
      />
      <div className="ci-advanced-content">
        <h2>{timeViews.find(([id]) => id === view)?.[1]}</h2>
        {(view === "overview" || view === "play-time") && (
          <>
            <div className="ci-primary-stat">
              <span>{playTimeLabel(duration)}</span>
              <strong>
                {formatDuration(
                  duration.withDuration ? duration.totalRecordedSeconds : null,
                )}
              </strong>
              <DurationCoverage summary={duration} />
            </div>
            <StatSummaryRow
              items={
                view === "overview"
                  ? [
                      [
                        "Average Game Duration",
                        formatDuration(duration.averageDurationSeconds),
                        `${number(duration.withDuration)} known durations`,
                      ],
                      ["Average Move Time", formatDuration(clock.average)],
                      [
                        "Clock Coverage",
                        coverage(clock.records.length, clock.real.length),
                      ],
                      [
                        "Duration Coverage",
                        coverage(
                          duration.withDuration,
                          duration.eligibleRealtimeGames,
                        ),
                      ],
                      ["Sessions", sessions.totalSessions],
                      [
                        "Timeout Losses",
                        <button type="button" onClick={onTimeout}>
                          {number(clock.timeoutLosses.length)} →
                        </button>,
                      ],
                    ]
                  : [
                      [
                        "Average Game Duration",
                        formatDuration(duration.averageDurationSeconds),
                        `${number(duration.withDuration)} known durations`,
                      ],
                      ["Games with Duration", duration.withDuration],
                      [
                        "Duration Coverage",
                        coverage(
                          duration.withDuration,
                          duration.eligibleRealtimeGames,
                        ),
                      ],
                    ]
              }
            />
            <PlayTimeTrend summary={duration} />
            {view === "play-time" ? (
              <PlayTimeDetails
                games={games}
                records={durationRecords}
                summary={duration}
                sessions={sessions}
              />
            ) : (
              <PlayHighlights summary={duration} sessions={sessions} />
            )}
          </>
        )}
        {view === "clock-usage" && (
          <ClockUsage games={games} onTimeout={onTimeout} analysis={analysis} />
        )}
        {view === "time-pressure" && (
          <TimePressure
            games={games}
            analysis={analysis}
            onTimeout={onTimeout}
          />
        )}
        {view === "sessions" && <SessionDetails summary={sessions} />}
        {view !== "clock-usage" && analysis.error && (
          <p className="ci-status" role="alert">
            {analysis.error}{" "}
            <button
              type="button"
              onClick={() =>
                void analysis
                  .request("clocks", { ids: games.map((game) => game.id) })
                  .catch(() => undefined)
              }
            >
              Retry Clock Analysis
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
