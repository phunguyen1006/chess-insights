import { useMemo, useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import { useAnalysis, analysisDebug } from "../../state/useAnalysis";
import { timeAnalytics, mean, median } from "../../../analysis/timeAnalytics";
import { longThinkThreshold } from "../../../analysis/clocks";
import {
  Panel,
  Stats,
  Bars,
  Select,
  number,
  Empty,
} from "../components/Common";
import { Trend } from "../components/Charts";
export function TimePage({
  username,
  games,
  onTimeout,
  version = 0,
}: {
  username: string;
  games: NormalizedGame[];
  onTimeout: () => void;
  version?: number;
}) {
  const { state, error, progress, request } = useAnalysis(
      username,
      games,
      true,
      version,
    ),
    [selected, setSelected] = useState(""),
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
  const mistakes = state.mistakes.filter((m) =>
      games.some((g) => g.id === m.gameId),
    ),
    timedMistakes = mistakes.filter((m) => m.inPressure !== null),
    pressureMistakes = timedMistakes.filter((m) => m.inPressure);
  const at20 = t.records.flatMap((r) => {
    const n = r.moves.find((m) => m.moveNumber === 20)?.remainingSeconds;
    return n === undefined || n === null ? [] : [n];
  });
  return (
    <>
      <h2>Time Management</h2>
      <p className="ci-muted">
        Understand how you use your clock across completed games.
      </p>
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
      <Stats
        actions={{ "Timeout losses": onTimeout }}
        items={[
          ["Average move", t.average === null ? "—" : `${number(t.average)}s`],
          ["Median move", t.median === null ? "—" : `${number(t.median)}s`],
          ["Time used / game", t.used === null ? "—" : `${number(t.used)}s`],
          [
            "Games in pressure",
            `${t.pressure.length} · ${pct(t.pressure.length, t.records.length)}`,
          ],
          ["Timeout losses", t.timeoutLosses.length],
          ["Clock coverage", pct(t.records.length, t.real.length)],
        ]}
      />
      <button onClick={onTimeout}>Timeout losses → Results</button>
      {!t.times.length ? (
        <Empty>No move-time data is available for the selected games.</Empty>
      ) : (
        <>
          <div className="ci-two-columns">
            <Panel title="Move-time distribution">
              <Bars rows={t.distribution} />
            </Panel>
            <Panel title="Thinking time by phase">
              <Bars
                rows={["opening", "middlegame", "endgame"].map((phase) => {
                  const a = t.records.flatMap((r) =>
                    r.moves
                      .filter(
                        (m) => m.phase === phase && m.thinkSeconds !== null,
                      )
                      .map((m) => m.thinkSeconds!),
                  );
                  return [
                    phase,
                    mean(a) ?? 0,
                    `${a.length} timed moves · seconds`,
                  ];
                })}
              />
            </Panel>
          </div>
          <Panel title="Clock remaining by move">
            <Select
              label="Curve outcome"
              value={outcome}
              options={["all", ["win", "Wins"], ["loss", "Losses"]]}
              onChange={setOutcome}
            />
            <Trend
              data={curve.clockCurve}
              label="Average remaining clock as percent of starting time"
            />
            <p className="ci-note">
              Percent of base clock, not effective clock. Increments can produce
              values above 100%. Null observations leave gaps.
            </p>
          </Panel>
          <Panel title="Average think time by move number">
            <Trend data={t.thinkCurve} label="Average think time in seconds" />
            <p className="ci-note">
              Moves 1–60 separately; later moves combined. Tooltips include
              observation counts.
            </p>
          </Panel>
          <Panel title="Time pressure">
            <Stats
              items={[
                ["Entered pressure", t.pressure.length],
                [
                  "Win rate after entry",
                  pct(
                    t.pressure.filter((r) => r.game.result === "win").length,
                    t.pressure.length,
                  ),
                ],
                [
                  "Average entry move",
                  mean(t.pressure.map((r) => r.pressure!.moveNumber)),
                ],
                [
                  "Clock at move 20",
                  at20.length
                    ? `${number(mean(at20))}s (${at20.length} games)`
                    : "—",
                ],
                [
                  "Timeout loss after entry",
                  pct(
                    t.pressure.filter(
                      (r) =>
                        r.game.result === "loss" &&
                        r.game.termination === "Timeout",
                    ).length,
                    t.pressure.length,
                  ),
                ],
              ]}
            />
            <p className="ci-note">
              Pressure begins below min(30 seconds, 10% of base clock). Entry is
              observed after a move; missing clocks can hide earlier entry.
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
                        <td>{number(mean(a))}s</td>
                        <td>{number(median(a))}s</td>
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
                              : `${number(m.thinkSeconds)}s`}
                          </td>
                          <td>
                            {m.remainingSeconds === null
                              ? "Unknown"
                              : `${number(m.remainingSeconds)}s`}
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
      <Panel title="Mistakes and time pressure">
        <p>
          Analyzed games:{" "}
          {
            state.analyses.filter((a) => games.some((g) => g.id === a.id))
              .length
          }
          . {pressureMistakes.length} / {timedMistakes.length} clock-covered
          mistakes occurred in pressure (
          {pct(pressureMistakes.length, timedMistakes.length)});{" "}
          {pressureMistakes.filter((m) => m.severity === "blunder").length} were
          blunders. Clock coverage: {timedMistakes.length} / {mistakes.length}{" "}
          mistakes. These are associations.
        </p>
      </Panel>
      <p className="ci-note">
        Opening: first 10 full moves. Later positions are endgames when ≤4
        non-pawn pieces remain, or no queens and ≤8 non-pawn pieces; all others
        are middlegame. Kings excluded. Unknown clock intervals are excluded
        from timing averages.
      </p>
    </>
  );
}
