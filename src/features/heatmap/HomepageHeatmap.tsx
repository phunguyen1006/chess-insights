import { useEffect, useMemo, useState } from "react";
import type { DataState } from "../state/useData";
import { combinedActivity } from "../../analytics/puzzles";
import { usePuzzleData } from "../state/usePuzzleData";
import { localDate } from "../../shared/dates";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { Setup } from "../insights/components/Setup";
import { openInsights } from "../../content/dom/routing";
export function HomepageHeatmap({
  state,
  detected,
}: {
  state: DataState;
  detected: string | null;
}) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, username, loading, error, refresh } = state;
  const puzzles = usePuzzleData(username);
  const attempts = useMemo(
    () =>
      puzzles.data.attempts.filter(
        (a) => Number(a.localDate.slice(0, 4)) === year,
      ),
    [puzzles.data.attempts, year],
  );
  const games = useMemo(
    () => data.games.filter((g) => Number(g.localDate.slice(0, 4)) === year),
    [data.games, year],
  );
  const stats = useMemo(
    () => combinedActivity(games, attempts),
    [games, attempts],
  );
  useEffect(() => {
    if (username) void refresh([year]);
  }, [year, username, refresh]);
  return (
    <section className="ci-scope ci-home-card">
      <header className="ci-row">
        <h2>Chess Activity</h2>
        <label className="ci-year">
          Year{" "}
          <select
            aria-label="Activity year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[...new Set([year, ...data.years])]
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
      </header>
      {!state.settingsLoaded ? (
        <p className="ci-summary">Loading local history…</p>
      ) : !username ? (
        <Setup state={state} detected={detected} />
      ) : (
        <>
          <p className="ci-summary">
            {loading && !games.length ? (
              "Loading statistics…"
            ) : (
              <>
                {stats.games.toLocaleString()} games ·{" "}
                {stats.puzzles
                  ? `${stats.puzzles.toLocaleString()} puzzles · `
                  : puzzles.data.tracking
                    ? `Puzzle tracking started${puzzles.data.tracking.puzzleTrackingStartedLocalDate === localDate(new Date()) ? " today" : ""} · `
                    : ""}
                {stats.activeDays}{" "}
                <span className="ci-summary-detail">active </span>
                days · {stats.current}{" "}
                <span className="ci-summary-detail">day </span>streak
              </>
            )}
            {loading && <span className="ci-muted"> · Updating…</span>}
          </p>
          <ActivityHeatmap
            compact
            games={games}
            attempts={attempts}
            mode="all"
            trackingSince={
              puzzles.data.tracking?.puzzleTrackingStartedLocalDate
            }
            year={year}
            onDate={(date) => openInsights("activity", date)}
          />
          {!games.length && !attempts.length && !loading && (
            <div className="ci-empty-inline">
              No games found for {year}.{" "}
              <button onClick={() => setYear(year - 1)}>Previous year</button>
            </div>
          )}
          {error && (
            <p className="ci-status" role="status">
              {error}{" "}
              {data.lastSync
                ? `Cached data from ${new Date(data.lastSync).toLocaleTimeString()}.`
                : ""}
              <button
                disabled={loading}
                onClick={() => void refresh([year], true)}
              >
                Retry
              </button>
            </p>
          )}
          <footer className="ci-row">
            <span className="ci-note">
              Chess activity · Games + Puzzles · Local time
            </span>
            <a
              href="#chess-insights/activity"
              onClick={(e) => {
                e.preventDefault();
                openInsights("activity");
              }}
            >
              View Insights →
            </a>
          </footer>
        </>
      )}
    </section>
  );
}
