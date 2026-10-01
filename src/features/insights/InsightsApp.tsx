import { useEffect, useMemo, useState } from "react";
import type { DataState } from "../state/useData";
import { SECTIONS } from "../../shared/constants";
import { readRoute, openInsights } from "../../content/dom/routing";
import { defaultFilters, filterGames } from "../../analytics/results";
import { localDate } from "../../shared/dates";
import { OverviewPage } from "./pages/OverviewPage";
import { ActivityPage } from "./pages/ActivityPage";
import { RatingPage } from "./pages/RatingPage";
import { OpeningsPage } from "./pages/OpeningsPage";
import { OpponentsPage } from "./pages/OpponentsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { FilterBar, Panel } from "./components/Common";
import { Setup } from "./components/Setup";
import { TimePage } from "./pages/TimePage";
import { MistakesPage } from "./pages/MistakesPage";
import { usePuzzleData } from "../state/usePuzzleData";
import type { ActivityMode } from "../../analytics/puzzles";
import { PuzzleSettings } from "./components/PuzzleSettings";
import { puzzleResults } from "../../analytics/puzzles";
export function InsightsApp({
  state,
  detected,
}: {
  state: DataState;
  detected: string | null;
}) {
  const [route, setRoute] = useState(readRoute()),
    [editing, setEditing] = useState(false),
    [filters, setFilters] = useState({
      ...defaultFilters,
      start: `${new Date().getFullYear()}-01-01`,
      end: localDate(new Date()),
    });
  const { data, username, loading, error, refresh } = state;
  const puzzles = usePuzzleData(username);
  const [activityMode, setActivityMode] = useState<ActivityMode>("all"),
    [settingsOpen, setSettingsOpen] = useState(false);
  const periodGames = useMemo(
    () =>
      filterGames(data.games, {
        ...filters,
        timeClass: "all",
        color: "all",
        result: "all",
        rated: "all",
      }),
    [data.games, filters],
  );
  const periodPuzzles = useMemo(
    () =>
      puzzles.data.attempts.filter(
        (a) =>
          (!filters.start || a.localDate >= filters.start) &&
          (!filters.end || a.localDate <= filters.end),
      ),
    [puzzles.data.attempts, filters.start, filters.end],
  );
  const puzzleStats = puzzleResults(periodPuzzles);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (route?.date) {
      const y = Number(route.date.slice(0, 4));
      setFilters((f) => ({ ...f, start: `${y}-01-01`, end: `${y}-12-31` }));
      void refresh([y]);
    }
  }, [route?.date, refresh]);
  const games = useMemo(
    () => filterGames(data.games, filters),
    [data.games, filters],
  );
  const section = route?.section ?? "overview";
  const loadPeriod = (period: string, start: string, end: string) => {
    const from = Number(start.slice(0, 4)),
      to = Number(end.slice(0, 4));
    const years =
      period === "all"
        ? data.years
        : from
          ? Array.from(
              {
                length: Math.min(
                  30,
                  (to || new Date().getFullYear()) - from + 1,
                ),
              },
              (_, i) => from + i,
            )
          : [];
    if (years.length) void refresh(years);
  };
  return (
    <div className="ci-scope ci-insights">
      <header className="ci-row ci-insights-header">
        <div>
          <p className="ci-eyebrow">YOUR CHESS, OVER TIME</p>
          <h1>Insights</h1>
          <p className="ci-muted">
            {username
              ? `Historical analytics for ${username}`
              : "Historical Chess.com analytics"}
          </p>
        </div>
        <div className="ci-header-actions">
          <a href="#">Back to Chess.com</a>
          {username && (
            <>
              <button onClick={() => setEditing(!editing)}>
                Switch account
              </button>
              <button onClick={() => setSettingsOpen((v) => !v)}>
                Settings
              </button>
              <button
                disabled={loading}
                onClick={() =>
                  void refresh(
                    data.years.filter(
                      (y) =>
                        !filters.start ||
                        y >= Number(filters.start.slice(0, 4)),
                    ),
                    true,
                  )
                }
              >
                ↻ Refresh
              </button>
            </>
          )}
        </div>
      </header>
      {detected && username && detected.toLowerCase() !== username && (
        <p className="ci-status">
          Chess.com appears to be signed in as {detected}.{" "}
          <button onClick={() => void state.connect(detected)}>
            Use this account
          </button>
        </p>
      )}
      <nav className="ci-navigation" aria-label="Insights sections">
        {SECTIONS.map((s) => (
          <a
            href={`#chess-insights/${s}`}
            className={section === s ? "ci-active" : ""}
            aria-current={section === s ? "page" : undefined}
            key={s}
            onClick={(e) => {
              e.preventDefault();
              openInsights(s);
            }}
          >
            {s[0].toUpperCase() + s.slice(1)}
          </a>
        ))}
      </nav>
      {!state.settingsLoaded ? (
        <p className="ci-muted">Loading local history…</p>
      ) : !username || editing ? (
        <Panel title="Connect public history">
          <Setup
            state={state}
            detected={detected}
            onConnected={() => setEditing(false)}
          />
        </Panel>
      ) : (
        <>
          {settingsOpen && <PuzzleSettings key={username} state={puzzles} />}
          <div className="ci-sync" role="status">
            {loading
              ? "Syncing…"
              : error
                ? "Unable to refresh — showing cached data"
                : "● Synced"}
            {!!data.lastSync && (
              <span>
                {" "}
                · Last updated {new Date(data.lastSync).toLocaleString()}
              </span>
            )}
            {!data.lastSync && !loading && (
              <span> · No successful sync yet</span>
            )}
          </div>
          {error && (
            <p className="ci-status">
              {error}
              <button
                disabled={loading}
                onClick={() => void refresh([new Date().getFullYear()], true)}
              >
                Retry
              </button>
            </p>
          )}
          {
            <>
              <FilterBar
                filters={filters}
                activityOnly={
                  section === "activity" && activityMode !== "games"
                }
                onChange={setFilters}
                onPeriod={loadPeriod}
              />
              <p className="ci-note">
                {data.games.length.toLocaleString()} games cached. Historical
                years load when selected; choose All time to load full history.
              </p>
            </>
          }
          {loading && !data.games.length ? (
            <Panel title="Loading statistics">
              <p className="ci-muted">
                Public history is loading. Statistics will appear as completed
                games arrive.
              </p>
            </Panel>
          ) : (
            <>
              {section === "overview" && (
                <>
                  {puzzleStats.attempts > 0 && (
                    <Panel title="Puzzle Activity">
                      <p>
                        {puzzleStats.attempts.toLocaleString()} attempts ·{" "}
                        {puzzleStats.successRate === null
                          ? "Success rate unavailable"
                          : `${puzzleStats.successRate.toFixed(1)}% success`}
                      </p>
                    </Panel>
                  )}
                  <OverviewPage
                    games={games}
                    allGames={data.games}
                    filters={filters}
                  />
                </>
              )}
              {section === "activity" && (
                <>
                  <div
                    className="ci-activity-modes"
                    role="group"
                    aria-label="Activity mode"
                  >
                    {(
                      [
                        ["all", "All Activity"],
                        ["games", "Games"],
                        ["puzzles", "Puzzles"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={activityMode === value}
                        onClick={() => setActivityMode(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ActivityPage
                    games={activityMode === "games" ? games : periodGames}
                    mode={activityMode}
                    attempts={periodPuzzles}
                    trackingSince={
                      puzzles.data.tracking?.puzzleTrackingStartedLocalDate
                    }
                    allGames={data.games}
                    years={[
                      ...new Set([
                        ...data.years,
                        ...puzzles.data.attempts.map((a) =>
                          Number(a.localDate.slice(0, 4)),
                        ),
                      ]),
                    ]}
                    selectedControl={filters.timeClass}
                    date={route?.date ?? ""}
                    onYear={(y) => {
                      setFilters((f) => ({
                        ...f,
                        start: `${y}-01-01`,
                        end: `${y}-12-31`,
                      }));
                      void refresh([y]);
                    }}
                  />
                  {puzzles.error && <p role="status">{puzzles.error}</p>}
                </>
              )}
              {section === "rating" && (
                <RatingPage
                  games={games}
                  allGames={data.games}
                  selectedControl={filters.timeClass}
                />
              )}
              {section === "openings" && <OpeningsPage games={games} />}
              {section === "opponents" && (
                <OpponentsPage games={games} allGames={data.games} />
              )}
              {section === "results" && (
                <>
                  <a href="#chess-insights/time">View Time Management →</a>
                  {route?.termination && (
                    <p className="ci-status">
                      Timeout losses{" "}
                      <button onClick={() => openInsights("results")}>
                        Clear termination filter
                      </button>
                    </p>
                  )}
                  <ResultsPage
                    games={
                      route?.termination
                        ? games.filter(
                            (g) =>
                              g.termination === route.termination &&
                              g.result === "loss",
                          )
                        : games
                    }
                  />
                </>
              )}
              {section === "time" && (
                <TimePage
                  version={data.version}
                  key={username}
                  username={username}
                  games={games}
                  onTimeout={() => {
                    setFilters((f) => ({ ...f, result: "loss" }));
                    location.hash =
                      "chess-insights/results?termination=Timeout";
                  }}
                />
              )}
              {section === "mistakes" && (
                <MistakesPage
                  key={username}
                  username={username}
                  games={games}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
