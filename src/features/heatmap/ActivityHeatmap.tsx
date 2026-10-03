import { useMemo, useRef, useEffect, useState, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import type { NormalizedGame, PuzzleAttempt } from "../../shared/types";
import {
  activityLevel,
  combinedLevels,
  puzzleHistoryKnown,
  puzzleResults,
  puzzlesByDay,
} from "../../analytics/puzzles";
import type { ActivityMode } from "../../analytics/puzzles";
import { calendar, displayDate } from "../../shared/dates";
import { byDay, getHeatmapIntensity } from "../../analytics/activity";
import { results } from "../../analytics/results";
import { observedDeltas, dayRatingChanges } from "../../analytics/ratings";
export type HeatmapMetric = "games" | "wins" | "winRate" | "rating";
export function ActivityHeatmap({
  games,
  year,
  onDate,
  metric = "games",
  pool = "all",
  ratingSource = games,
  compact = false,
  attempts = [],
  mode = "games",
  trackingSince,
}: {
  games: NormalizedGame[];
  year: number;
  onDate: (date: string) => void;
  metric?: HeatmapMetric;
  pool?: string;
  ratingSource?: NormalizedGame[];
  compact?: boolean;
  attempts?: PuzzleAttempt[];
  mode?: ActivityMode;
  trackingSince?: string;
}) {
  const weeks = useMemo(() => calendar(year), [year]),
    days = useMemo(() => byDay(games), [games]);
  const puzzleDays = useMemo(() => puzzlesByDay(attempts), [attempts]);
  const levels = useMemo(
    () =>
      mode === "all"
        ? combinedLevels(games, attempts)
        : new Map(
            [...puzzleDays].map(([d, a]) => [
              d,
              activityLevel(
                a.length,
                [...puzzleDays.values()].map((p) => p.length),
              ),
            ]),
          ),
    [games, attempts, puzzleDays, mode],
  );
  const deltas = useMemo(() => observedDeltas(ratingSource), [ratingSource]);
  const values = useMemo(
    () =>
      [...days.values()].map((list) =>
        metric === "wins" ? results(list).wins : list.length,
      ),
    [days, metric],
  );
  const intensities = useMemo(
    () =>
      new Map(
        [...days].map(([date, list]) => {
          const r = results(list);
          if (metric === "rating") {
            const change = dayRatingChanges(list, deltas).get(pool);
            return [
              date,
              change === undefined ? 0 : change === 0 ? 2 : change > 0 ? 4 : 1,
            ];
          }
          if (metric === "winRate")
            return [date, Math.max(1, Math.ceil(r.winRate / 20))];
          return [
            date,
            getHeatmapIntensity(
              metric === "wins" ? r.wins : list.length,
              values,
            ),
          ];
        }),
      ),
    [days, deltas, metric, pool, values],
  );
  const container = useRef<HTMLDivElement>(null),
    tooltipRef = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(0),
    [tooltip, setTooltip] = useState<{
      date: string;
      x: number;
      y: number;
    } | null>(null);
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const r = tooltipRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, tooltip.x)),
      y = Math.max(8, Math.min(window.innerHeight - r.height - 8, tooltip.y));
    if (x !== tooltip.x || y !== tooltip.y) setTooltip({ ...tooltip, x, y });
  }, [tooltip]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const labels = compact ? 24 : 34;
  const gap = compact ? (width < 550 ? 1 : 3) : width < 550 ? 1 : 3,
    cell = Math.max(
      1,
      Math.min(
        compact ? 17 : 13,
        (width - labels - gap * (weeks.length - 1)) / weeks.length,
      ),
    );
  const pitch = compact
    ? cell + gap
    : width > labels
      ? (width - labels) / weeks.length
      : cell + gap;
  const style = {
    "--ci-cell": `${cell}px`,
    "--ci-gap": `${gap}px`,
    "--ci-pitch": `${pitch}px`,
    "--ci-weeks": weeks.length,
    "--ci-grid-width": `${weeks.length * cell + (weeks.length - 1) * gap}px`,
  } as CSSProperties;
  const months = Array.from({ length: 12 }, (_, m) => ({
    name: new Date(year, m, 1).toLocaleDateString("en", { month: "short" }),
    column: weeks.findIndex((w) =>
      w.includes(`${year}-${String(m + 1).padStart(2, "0")}-01`),
    ),
  }));
  const show = (date: string, target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    setTooltip({
      date,
      x: Math.max(8, Math.min(window.innerWidth - 248, r.left)),
      y: r.top > 190 ? r.top - 178 : r.bottom + 8,
    });
  };
  const tooltipGames = tooltip ? (days.get(tooltip.date) ?? []) : [],
    stats = results(tooltipGames),
    changes = dayRatingChanges(tooltipGames, deltas);
  return (
    <div
      className={`ci-calendar-wrap${compact ? " ci-calendar-compact" : ""}`}
      ref={container}
      style={style}
    >
      <div className="ci-months">
        {months.map((m) => (
          <span key={m.name} style={{ gridColumn: m.column + 1 }}>
            {m.name}
          </span>
        ))}
      </div>
      <div
        className="ci-calendar"
        aria-label={`${year} chess activity calendar`}
      >
        <div className="ci-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) =>
            compact && ![0, 2, 4].includes(i) ? null : (
              <span
                key={day}
                style={{
                  top: `calc(${compact ? "(var(--ci-cell) + var(--ci-gap))" : "max(16px, var(--ci-cell) + var(--ci-gap))"} * ${i})`,
                }}
              >
                {day}
              </span>
            ),
          )}
        </div>
        <div className="ci-weeks">
          {weeks.map((week, i) => (
            <div className="ci-week" key={i}>
              {week.map((date, j) => {
                if (!date)
                  return <span className="ci-cell ci-outside" key={j} />;
                const list = days.get(date) ?? [],
                  intensity =
                    (mode === "games" ? intensities : levels).get(date) ?? 0;
                const tracked = puzzleHistoryKnown(date, trackingSince),
                  puzzles = puzzleDays.get(date)?.length ?? 0,
                  known = tracked || puzzles > 0;
                const label = `${displayDate(date)} — ${mode === "puzzles" ? "" : `${list.length} games`}${mode === "games" ? "" : ` · ${known ? `${puzzles} puzzle attempts${!tracked ? " recorded; history may be incomplete" : ""}` : "Puzzle history not tracked yet"}`}`;
                return (
                  <button
                    key={date}
                    type="button"
                    className={`ci-cell ci-level-${intensity}${mode === "puzzles" && !known ? " ci-puzzle-unknown" : ""}`}
                    aria-label={label}
                    aria-describedby={
                      tooltip?.date === date ? "ci-calendar-tooltip" : undefined
                    }
                    onMouseEnter={(e) => show(date, e.currentTarget)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={(e) => show(date, e.currentTarget)}
                    onBlur={() => setTooltip(null)}
                    onClick={() => {
                      setTooltip(null);
                      onDate(date);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setTooltip(null);
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        const buttons =
                          container.current?.querySelectorAll<HTMLButtonElement>(
                            ".ci-cell:not(.ci-outside)",
                          );
                        if (!buttons) return;
                        const index = Array.from(buttons).indexOf(
                          e.currentTarget,
                        );
                        const offset =
                          e.key === "ArrowLeft"
                            ? -7
                            : e.key === "ArrowRight"
                              ? 7
                              : e.key === "ArrowUp"
                                ? -1
                                : 1;
                        buttons[
                          Math.max(
                            0,
                            Math.min(buttons.length - 1, index + offset),
                          )
                        ]?.focus();
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="ci-legend">
        <span>
          {metric === "rating"
            ? "Negative · Flat · Positive observed movement"
            : "Less"}
        </span>
        {(mode === "games" ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]).map((n) => (
          <span
            key={n}
            className={`ci-cell ci-level-${n}`}
            aria-label={`Intensity ${n}`}
          />
        ))}
        {metric !== "rating" && <span>More</span>}
      </div>
      {tooltip && (
        <div
          role="tooltip"
          id="ci-calendar-tooltip"
          ref={tooltipRef}
          className="ci-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong>{displayDate(tooltip.date)}</strong>
          {mode !== "puzzles" && (
            <div>
              {stats.games ? `${stats.games} games` : "No recorded games"}
            </div>
          )}
          {mode !== "games" &&
            (puzzleHistoryKnown(tooltip.date, trackingSince) ||
            puzzleDays.has(tooltip.date) ? (
              (() => {
                const p = puzzleResults(puzzleDays.get(tooltip.date) ?? []);
                return (
                  <>
                    <div>
                      {p.attempts
                        ? `${p.attempts} puzzles attempted`
                        : "No puzzles attempted"}
                    </div>
                    {p.attempts > 0 && (
                      <>
                        <div>
                          {p.solved} solved · {p.failed} failed
                          {p.attempts > p.resolved
                            ? ` · ${p.attempts - p.resolved} unknown`
                            : ""}
                        </div>
                        <div>
                          {p.successRate === null
                            ? "Success rate unavailable"
                            : `${p.successRate.toFixed(1)}% success`}
                        </div>
                      </>
                    )}
                    {!puzzleHistoryKnown(tooltip.date, trackingSince) && (
                      <div>
                        Restored records; other attempts may be missing.
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <div>Puzzle history not tracked yet</div>
            ))}
          {mode !== "puzzles" && stats.games > 0 && (
            <>
              <div>
                {stats.wins} wins · {stats.losses} losses · {stats.draws} draws
              </div>
              <div>{Math.round(stats.winRate)}% win rate</div>
              {["rapid", "blitz", "bullet", "daily", "unknown"].map((p) => {
                const count = tooltipGames.filter(
                  (g) => g.timeClass === p,
                ).length;
                return count ? (
                  <div key={p}>
                    {p}: {count}
                    {changes.has(p)
                      ? ` · observed ${changes.get(p)! >= 0 ? "+" : ""}${changes.get(p)}`
                      : ""}
                  </div>
                ) : null;
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
