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
import { PuzzleBackupSettings } from "./components/PuzzleBackupSettings";
import { GameExport } from "./components/GameExport";
import { usePlayTime, playTimeDebug } from "../state/usePlayTime";
import { playTimeSummary, sessionAnalytics } from "../../analytics/playTime";
import { SegmentedControl } from "./components/NativeStats";
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
  const [activityMode, setActivityMode] = useState<ActivityMode | "playTime">(
      () => {
        const value = new URLSearchParams(
          location.hash.split("?")[1] ?? "",
        ).get("activity");
        return value && ["all", "games", "puzzles", "playTime"].includes(value)
          ? (value as ActivityMode | "playTime")
          : "all";
      },
    ),
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
    const update = () => {
      setRoute(readRoute());
      const mode = new URLSearchParams(location.hash.split("?")[1] ?? "").get(
        "activity",
      );
      if (mode && ["all", "games", "puzzles", "playTime"].includes(mode))
        setActivityMode(mode as ActivityMode | "playTime");
    };
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
  const duration = usePlayTime(
    username,
    data.version,
    section === "overview" ||
      section === "time" ||
      (section === "activity" && activityMode === "playTime"),
  );
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    playTimeDebug.username = username;
    playTimeDebug.coverage = playTimeSummary(games, duration.records);
    playTimeDebug.sessions = sessionAnalytics(
      games,
      duration.records,
      30,
      data.games,
    );
  }, [username, games, duration.records, data.games]);
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
              <button
                aria-expanded={settingsOpen}
                aria-controls="ci-settings"
                onClick={() => setSettingsOpen((v) => !v)}
              >
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
          {settingsOpen && (
            <div id="ci-settings" key={username}>
              <PuzzleBackupSettings
                username={username}
                onImported={puzzles.reload}
              />
              <PuzzleSettings state={puzzles} />
            </div>
          )}
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
                hideColor={
                  section === "rating" ||
                  section === "openings" ||
                  section === "results"
                }
                activityOnly={
                  section === "activity" &&
                  activityMode !== "games" &&
                  activityMode !== "playTime"
                }
                onChange={setFilters}
                onPeriod={loadPeriod}
              />
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
                  <OverviewPage
                    games={games}
                    allGames={data.games}
                    filters={filters}
                    durationRecords={duration.records}
                    durationLoading={duration.loading}
                  />
                  {puzzleStats.attempts > 0 && (
                    <p className="ci-note">
                      Puzzle activity: {puzzleStats.attempts.toLocaleString()}{" "}
                      attempts ·{" "}
                      {puzzleStats.successRate === null
                        ? "Success rate unavailable"
                        : `${puzzleStats.successRate.toFixed(1)}% success`}{" "}
                      <a href="#chess-insights/activity?activity=puzzles">
                        View puzzles →
                      </a>
                    </p>
                  )}
                </>
              )}
              {section === "activity" && (
                <>
                  <SegmentedControl
                    label="Activity mode"
                    value={activityMode}
                    options={[
                      ["all", "All Activity"],
                      ["games", "Games"],
                      ["puzzles", "Puzzles"],
                      ["playTime", "Play Time"],
                    ]}
                    onChange={(value) => {
                      setActivityMode(value as ActivityMode | "playTime");
                      const params = new URLSearchParams(
                        location.hash.split("?")[1] ?? "",
                      );
                      params.set("activity", value);
                      location.hash = `chess-insights/activity?${params}`;
                    }}
                  />
                  <ActivityPage
                    games={
                      activityMode === "games" || activityMode === "playTime"
                        ? games
                        : periodGames
                    }
                    mode={activityMode}
                    attempts={periodPuzzles}
                    trackingSince={
                      puzzles.data.tracking?.puzzleTrackingStartedLocalDate
                    }
                    allGames={data.games}
                    durationRecords={duration.records}
                    durationLoading={duration.loading}
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
                  color={filters.color}
                  onColorChange={(color) =>
                    setFilters((f) => ({ ...f, color }))
                  }
                  allGames={data.games}
                  selectedControl={filters.timeClass}
                />
              )}
              {section === "openings" && (
                <OpeningsPage
                  games={games}
                  color={filters.color}
                  onColorChange={(color) =>
                    setFilters((f) => ({ ...f, color }))
                  }
                />
              )}
              {section === "opponents" && (
                <OpponentsPage games={games} allGames={data.games} />
              )}
              {section === "results" && (
                <>
                  <SegmentedControl
                    label="Results color"
                    value={filters.color}
                    options={[
                      ["all", "All Games"],
                      ["white", "White"],
                      ["black", "Black"],
                    ]}
                    onChange={(color) => setFilters((f) => ({ ...f, color }))}
                  />
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
                  <p className="ci-note">
                    <a href="#chess-insights/time">View Time Management →</a>
                  </p>
                </>
              )}
              {section === "time" && (
                <TimePage
                  version={data.version}
                  key={username}
                  username={username}
                  games={games}
                  ratingSource={data.games}
                  durationRecords={duration.records}
                  durationLoading={duration.loading}
                  durationProcessed={duration.processed}
                  durationTotal={duration.total}
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
          {duration.error && (
            <p role="status">Play time unavailable: {duration.error}</p>
          )}
          <footer className="ci-status-footer">
            <div className="ci-sync" role="status">
              {loading
                ? "Syncing…"
                : error
                  ? "Unable to refresh — showing cached data"
                  : data.lastSync
                    ? "Synced"
                    : "No successful sync yet"}
              {!!data.lastSync &&
                ` · Last updated ${new Date(data.lastSync).toLocaleString()}`}
            </div>
            <details className="ci-details">
              <summary>History, exports and data coverage</summary>
              <p>
                {data.games.length.toLocaleString()} games cached. Historical
                years load when selected; choose All time to load full history.
                Archive ratings are historical observations, not current live
                ratings.
              </p>
              <GameExport
                key={username}
                username={username}
                games={
                  section === "results" && route?.termination
                    ? games.filter(
                        (g) =>
                          g.termination === route.termination &&
                          g.result === "loss",
                      )
                    : games
                }
                loading={loading}
              />
            </details>
          </footer>
        </>
      )}
    </div>
  );
}
