# v0.1.8 implementation and visual QA

This update adds observed Play Time and Sessions, and redesigns the existing Insights pages around Chess.com's Stats composition. It preserves the standalone extension, existing analytics, cached games, puzzles, engine results and review schedules. No permissions or dependencies were added. Verification uses public game data and local fixtures, without a Chess.com login.

## Play Time: data, coverage and cache

Duration sources are tried in this order:

1. Valid PGN Start/End headers, including UTCDate/UTCTime, explicit EndDate, timezone offsets and midnight rollover. These supply an observed interval.
2. Clock reconstruction from actual per-ply clock expenditure, with increments, rounding tolerance, at least 95% valid differences and both players' final clocks. This supplies a derived duration, without inventing start/end timestamps.
3. Complete valid `%emt` elapsed-move annotations, also marked derived.
4. Unavailable: `durationSeconds: null`, never a nominal-control estimate or a zero substituted for missing time.

Negative, impossible and severely inconsistent observations are rejected. Pool-specific sanity guards reject broken multi-hour Bullet timestamps. Strongly conflicting header/clock sources remain unavailable and carry a diagnostic for inspection. Missing or invalid headers can fall back to reliable clocks. Daily, variants and puzzle time are excluded from this metric.

Every summary reports the number of eligible real-time games, known durations and coverage. “Total Play Time” is used only with complete selected-game duration coverage; otherwise “Recorded Play Time” is shown. Coverage concerns the selected cached games, not an assertion that all lifetime archives have been downloaded. Empty samples show an em dash.

The stored public `erik` fixture produced the following independently checked result:

| Measure                           |                      Result |
| --------------------------------- | --------------------------: |
| Selected completed standard games |                         193 |
| Daily excluded                    |                         121 |
| Eligible real-time games          |                          72 |
| Known durations                   |                          72 |
| Header / clock / EMT sources      |                  72 / 0 / 0 |
| Duration coverage                 |                        100% |
| Recorded time                     | 11,573 seconds — 3h 12m 53s |
| Average known-game duration       |  160.736 seconds — 2m 40.7s |

These are public fixture results, not the user's authenticated account totals. Five original PGNs were manually checked using Start/End subtraction, then independently checked with time headers removed to exercise clock reconstruction. See [the exact games, clock values and calculations](PLAY-TIME-VALIDATION.md).

IndexedDB v4 adds only `gameDurationAnalysis`, keyed by the existing game ID and indexed by username. All 11 earlier stores remain. Records carry parser version 1 and a PGN/metadata fingerprint. Missing, outdated or changed records are recomputed; unchanged records are reused. Production snapshots carry the opaque fingerprint while keeping raw PGNs in extension storage, so the UI can validate cached duration records without transferring thousands of PGNs.

Analysis starts lazily on Overview, Time or Activity → Play Time. Cached data appears immediately, followed by incremental progress. Work yields before starting and after at most 12 games or a 16ms batch budget. Same-account requests share work; a newly synchronized snapshot causes a fresh pass. Account/generation guards reject late replies from earlier accounts and prevent partial cache reads from replacing final results. The homepage does not initiate duration parsing.

## Sessions

Sessions use observed Start/End intervals from completed real-time games. A gap greater than 30 minutes starts a new session. Games with unknown intervals break apparent joins, preventing a missing game from falsely connecting two sessions. Daily is excluded. Clock-only and EMT durations count toward Play Time but cannot establish session chronology.

The public fixture reconstructs **53 sessions from 72/72 eligible games (100% interval coverage)**. Average session span is 4m 26.3s; the longest is 28m 51s; the maximum session has four games. Session span includes short breaks. “Recorded game time” sums durations and is displayed separately.

Implemented session statistics include session count, average span, games per session, longest span, most games, rating change by pool, duration distribution, recent-session rows and win rate/sample count by Game 1–6 and Game 7+. Rating differences use consecutive archive observations within the same session and rating pool. The initial pregame rating is unavailable; unrelated pools and previous sessions are not combined. Game-number comparisons are descriptive and make no claim about fatigue or causation.

Development diagnostics add `getPlayTimeCoverage()` and `getSessionAnalyticsStatus()` to the existing debug API. Normal production builds exclude this API.

## Page structure and retained functionality

| Page      | Primary composition                                                                                                                                  | Detailed functionality retained                                                                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview  | Games / Win Rate / Active Days / Play Time summary; cyan play-time preview; four pool rating cards; one Activity area chart; WDL and Highlights rows | Previous-period comparisons with coverage, color/control/results/termination/opening breakdowns under More activity details, puzzle summary and navigation                        |
| Activity  | All Activity / Games / Puzzles / Play Time control                                                                                                   | Existing combined and puzzle analytics; separate seconds-based Play Time calendar, day coverage/control tooltip, monthly trend, records and selected-day game list                |
| Rating    | Pool heading and dominant rating; cyan area graph; Highest Rating / Rated Games / Period Change; centered All Games / White / Black; WDL             | Highlights: highest, best win, best streak, strongest opponent and biggest observed gain day; Average Opponent Rating rows; rolling/raw/drawdown analytics in More rating details |
| Results   | Compact WDL summary and horizontal outcome bar; green win, red loss and gray draw reason rows                                                        | Per-control stacked outcomes; detailed terminations and timeout trends; Time navigation                                                                                           |
| Openings  | Table with opening, color, games, WDL and win-rate bar                                                                                               | Color/ranking controls; detailed most-played bars, stacked outcomes and sample-size/win-rate scatter plot under More opening details                                              |
| Opponents | Highlights and searchable/paginated opponent table                                                                                                   | Selected-opponent game list, rating/performance/encounter statistics; supplementary charts in expandable details                                                                  |
| Mistakes  | Advanced-style secondary navigation: Overview / Blunders / Mistakes / Inaccuracies / By Phase / Review; compact analyzed coverage and severity rows  | Engine queue/scope/pause/resume/retry/cancel, severity/phase/review filters, mistake table, replay/reveal/grade flow; detailed charts and engine/time association data            |

Time keeps one top-level tab and a 176px secondary rail at desktop widths. On narrow layouts the rail becomes horizontally scrollable local navigation.

| Time section  | Content                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Recorded/Total Play Time, game duration, average move time, clock/duration coverage, sessions and timeout-loss summary; cyan play-time trend and Highlights                                                       |
| Play Time     | Large recorded total with coverage; last-12-month cyan area chart; time/share by Rapid/Blitz/Bullet; average duration/sample counts; duration histogram; linked Longest Games table and Play Time Highlights      |
| Clock Usage   | Average/median move time, user thinking time/game, move-time distribution, phase time, clock remaining by move, average think time by move, pool breakdowns, observed game replay and existing completeness notes |
| Time Pressure | Pressure incidence/results, entry move/clock-at-move-20, timeout loss after entry, cyan pressure-entry chart and existing detailed comparisons                                                                    |
| Sessions      | Session span trend, summaries/records, per-pool observed rating change, span distribution, game-number performance, and paginated Recent Sessions with span and recorded time separate                            |

## Design and reference comparison

The four user-supplied screenshots set the visual benchmark: profile rating cards, Stats overview, compact game tables and a detailed Rapid stats page. Public [Stats documentation](https://support.chess.com/en/articles/8705902-what-does-my-stats-page-show) and [opening statistics documentation](https://support.chess.com/en/articles/8705347-how-can-i-see-my-opening-stats) were inspected before the redesign. They informed the pool/period hierarchy, Highlights, opponent-rating rows and structured detail layout. No proprietary icons, member-only endpoints or screenshot assets were copied.

- The shell uses a white surface, 5px radius, minimal shadow and wallpaper visible outside it. Top sections use dark text with a thin green active underline.
- Time control and Period are the two primary selectors; Rated, Color and Result move into contextual More filters. Rating/Openings use controlled color segments; Results has an All Games / White / Black segment through the shared shell.
- Large near-black values sit above small gray context. Compact summary rows have light separators instead of repeated bordered KPI cards.
- Gray section headers and striped list/table rows provide the information hierarchy. Highlights and Average Opponent Rating use consistent shared rows.
- Rating, activity and duration trends use `#42b8e8` with subtle cyan area fill, light horizontal grid and quiet axes. Ordinary multi-point line charts have no permanent dots; hover/focus exposes one marker and a compact tooltip. Isolated valid points remain visible. Missing observations leave gaps, including separate fill segments.
- Green means wins/positive/action, muted red means losses/negative and gray means draws. Outcome donut charts were replaced by horizontal outcome bars or structured reason rows; opening/opponent data primarily uses tables and Mistake severity uses horizontal comparisons.
- Shared `ChessSection`, `ChessSectionRow`, `StatSummaryRow`, `SegmentedControl`, `SecondarySidebar`, `PoolIcon`, `WdlBar`, duration/percentage/delta formatters and the existing shared chart/select components keep styling consistent. Icons are original SVG paths.
- Cache/history diagnostics and CSV export are in a small footer disclosure. Settings and Refresh remain compact header actions.

The result follows the supplied Stats rhythm without claiming a pixel-identical clone. It retains the extension's own original icons, accessible controls, eight analytics sections and extra coverage information. It does not reproduce Chess.com's proprietary advanced evaluations, friend ranks, membership panels or their cyan chart smoothing when smoothing would distort observations.

## Browser visual and interaction QA

Screenshots were rendered and inspected at **1280 × 900** and **390 × 844**. The local reference theme uses a white sidebar resembling the supplied screenshots and a fixture wallpaper; production keeps the user's actual Chess.com background.

| Inspected view       | Saved evidence                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Overview             | [Desktop](images/native-stats/overview-desktop.png), [390px](images/native-stats/overview-mobile.png)             |
| Rating               | [Desktop](images/native-stats/rating-desktop.png), [390px](images/native-stats/rating-mobile.png)                 |
| Time → Overview      | [Desktop](images/native-stats/time-overview-desktop.png)                                                          |
| Time → Play Time     | [Desktop](images/native-stats/time-play-time-desktop.png), [390px](images/native-stats/time-play-time-mobile.png) |
| Time → Clock Usage   | [Desktop](images/native-stats/time-clock-usage-desktop.png)                                                       |
| Time → Time Pressure | [Desktop](images/native-stats/time-pressure-desktop.png)                                                          |
| Time → Sessions      | [Desktop](images/native-stats/sessions-desktop.png)                                                               |
| Activity → Play Time | [Desktop](images/native-stats/activity-play-time-desktop.png)                                                     |
| Results              | [Desktop](images/native-stats/results-desktop.png)                                                                |
| Openings             | [Desktop](images/native-stats/openings-desktop.png), [390px](images/native-stats/openings-mobile.png)             |
| Opponents            | [Desktop](images/native-stats/opponents-desktop.png)                                                              |
| Mistakes             | [Desktop](images/native-stats/mistakes-desktop.png), [390px](images/native-stats/mistakes-mobile.png)             |
| Mistake review       | [Revealed board/answer](images/native-stats/mistake-review-desktop.png)                                           |
| Homepage placement   | [Reported-grid fixture](images/native-stats/homepage-regression.png)                                              |

Visual iteration corrected rating heading/value hierarchy, cyan fill baselines, missing-data fills, excessive narrow preview columns, long row values, checkbox size, analysis progress wrapping and the Play Time year selector. Wide tables retain their own scroll containers; they do not widen the page. All eight primary sections were checked for navigation and page overflow. Desktop page width stayed below the 1280px viewport; the app was 980px wide. At 390px the page stayed within the viewport despite the fixture's persistent 110px sidebar. Time's secondary navigation scrolls locally.

The bundled local Stockfish WASM analyzed the completed public game [147472983586](https://www.chess.com/game/live/147472983586) in the fixture. It persisted one inaccuracy. Review revealed move 4, played `g3`, best move `d4`, evaluation +0.30 → −0.37 and 67cp loss. Grading Good changed the record to Scheduled; the session showed one reviewed item and zero due/unreviewed items. This verifies real engine computation and the UI/review storage flow; it does not substitute for extension-origin offscreen delivery checks.

The homepage remains the green/white combined Games + Puzzles calendar. At 1280px, the reported-grid fixture measured Play Online and heatmap widths of 1,057px; Recommended Match was 733px, Daily Puzzle 300px and their gap 24px, exactly the same combined width. Play ended at y=526; the heatmap started at y=546 and ended at y=857.7; both lower cards started at y=877.7. One heatmap and one sidebar Insights item were mounted. Train and Watch retained one Insights item after native reconciliation, and opening it from Watch reached the Insights route. Existing DOM/navigation regression tests also cover remounts. No Time dashboard was added to Home.

## Automated verification and packaging

**333 tests in 43 files pass**, plus TypeScript, ESLint and the verified normal production build. This adds 75 tests and 11 files beyond v0.1.7. The full suite initially exposed a development-server transform timeout under unrestricted parallel workers; the same test passed in isolation. Limiting the suite to four workers resolved resource contention without relaxing timeouts or assertions. The final full run completed in 21.22 seconds.

The suite covers real PGN source paths, timestamps/timezones/rollover, clock increments/coverage, elapsed annotations, Daily exclusion, impossible values, stale fingerprints, production-redacted snapshots, session boundaries/rating isolation, cache reuse/yielding/concurrent sync, account switches and stale runtime replies. UI regressions cover native controls, records/tables, chart gaps/markers, filters, day selection, old clock analytics, puzzle migrations/backups/exports and engine/review lifecycle.

Final review caught a production-only fingerprint mismatch: raw PGNs were deliberately removed from runtime snapshots, so duration matching recomputed a different fingerprint. The fix carries an opaque fingerprint before redaction and trusts it only for a redacted game; full PGNs always recompute their fingerprint. An integration regression now passes through the real production snapshot/cache/analytics path, verifies the public totals, and rejects changed PGNs with stale metadata. The fixture now uses the same redaction helper. Its final browser Play Time and Sessions checks again showed 72/72 coverage and 53 sessions. An independent read-only UI review found no remaining blocking regression.

Production packaging verifies synchronized versions, required scripts/styles/icons, local Stockfish WASM/source/licenses and exclusion of fixture/debug code. The ZIP has `manifest.json` at its root and includes installation/license notices.

The packaged `chess-insights-v0.1.8.zip` is 6,510,818 bytes. SHA-256: `ae999873029b61295ed7a9401fc22095f682321e765c834a1303e8824ec8c2f6`. Its archive entries were inspected and the checksum matched the generated `SHA256SUMS.txt`.

## Requires final manual verification in authenticated Edge

Load or reload the rebuilt **same `dist/` folder**, preserving the extension identity; then refresh Chess.com. Existing local history should remain, and the first Insights duration pass may show calculation progress.

1. Check Home: heatmap directly below Play Online and above Recommended Match + Daily Puzzle, matching their combined width. Check Insights remains after Train/Watch/native route changes.
2. Check the new Stats shell with the real theme, username, data volume and browser zoom. Test pool/period/color controls and narrow windows; screenshots can guide any live DOM/style adjustment.
3. Check Play Time coverage for the account's actual PGNs. Confirm Daily is excluded, incomplete duration is labeled Recorded, and Sessions show their separate interval coverage. Cached totals should return after refresh.
4. Check production extension offscreen Stockfish, pending analysis resume, review reveal/grade, puzzle completion/OFF/Clear/cross-tab behavior and backup/filtered CSV downloads.

No authenticated Chess.com DOM or the user's real historical totals were accessed during this work. Local checks completed without asking the user to log into the development browser.
