# Chess Insights data flow

Baseline: v0.1.10 (`a8b7455`), audited candidate: v0.1.11; this is an architecture map, not verification evidence. Results and limits are in [FINAL-AUDIT.md](../FINAL-AUDIT.md).

```text
PubAPI profiles/archive index/monthly games    Chess.com rated-puzzle completion DOM
                 │                                         │
           API shape validation                     conservative DOM extraction
                 │                                         │
     normalizeGame/result/opening                    account/attempt identity
                 │                                         │
    games + archives + users IndexedDB              puzzleAttempts + tracking state
                 │                                         │
  username snapshot (PGN redacted)                        account snapshot
                 └─────────── filters by local date ────────┘
                                      │
                       aggregation → React/SVG → heatmaps/charts
```

Full stored PGNs also feed two local derivations: duration/clock parsing and
on-demand completed-game Stockfish. These run in the extension origin; no private
Chess.com endpoint or cloud analysis supplies their results.

## Sources and normalization

| Stream | Raw source/fields | Optional/unknown handling | Normalization and consumer |
| --- | --- | --- | --- |
| Games | `https://api.chess.com/pub/player/{username}/games/archives`, then `/games/{YYYY}/{MM}`; `uuid`, `url`, `end_time`, white/black usernames/result/rating, `rules`, `rated`, `time_class`, `time_control`, PGN, `eco` | No matching player, invalid end time, unsupported variant or unrecognized result is rejected. Missing finite rating/PGN/opening/URL is null/empty. Missing supported pool becomes `unknown`. | `chessComApi.ts` → `normalizeGame.ts` → `syncManager.ts` → `gameRepository.ts` → `useData.ts`; charts use `filterGames` and pure analytics. |
| Result/end reason | Player result codes, opponent result for a win | Recognized draw/loss codes; fallback loss when opponent wins; unsupported result is skipped. Unmapped termination is Other. | `normalizeResult.ts`; W/D/L denominator is all selected completed games, draws included. |
| Opening | PGN ECO/Opening/Variation/ECOUrl or raw ECO URL | Unknown is null. Malformed URL is ignored. | `normalizeOpening.ts`; group by player color, ECO and opening family. Usage includes only games with known opening/ECO, ranking has a 10-game threshold. |
| Ratings | Finite player's pregame rating on rated standard games | Unrated/missing rating excluded from rating trends; separate pools. | `ratings.ts`; observed change is adjacent rating observations, not a known postgame delta. Current is latest observed value. Opponent ratings use finite observed values. |
| Controls | Raw `time_class`, `time_control` | Unknown pool remains explicit; simple seconds/increment controls supported for clock analytics; staged/daily unsupported for clock arithmetic. | `clocks.ts` and normalized pool; nominal time is never substituted for played duration. |
| Timestamps | Game `end_time` seconds; puzzle `attemptedAt` milliseconds | Finite positive timestamps required; both reject completion more than 60 seconds in the future. Cached game reads apply the same guard without deleting the stored record. | Games' local dates are recomputed when reading storage; `dates.ts` uses browser-local calendar days. PGN Start/End parsing supports explicit UTC or numeric offsets independently of display timezone. |
| Puzzles | Visible completed rated-puzzle metadata, ID/outcome/rating deltas, account and attempt timestamp | Ambiguous completions skipped, unknown result allowed; Daily/Rush/Battle/review routes excluded. No puzzle positions/answers are read. | `content/puzzles/tracker.ts` → runtime sender gate → `puzzleRepository.ts`. Unique attempt IDs prevent rerender duplicates; repeated legitimate attempts are distinct. Backup merge preserves original local dates and rejects conflicts. |
| Heatmap | Cached normalized games and recorded puzzle attempts | Future/untracked puzzle days are unknown; calendar has null padding, local-day grouping. | `activity.ts`/`puzzles.ts`/`ActivityHeatmap.tsx`. Games and puzzles counts add in Combined; color uses max of independently normalized game/puzzle levels, not a count sum intensity. Date filters never alter stored history. |
| Streaks | Unique local activity days | Current uses today or yesterday; future days excluded from streak calculations. | `streaks.ts`; separate game/puzzle and combined day sets. |
| Clock/time played | Full completed stored PGN, time control, header timestamps, `%clk`/`%emt` | Daily excluded. Reliable complete header interval preferred; then ≥95% clock coverage and valid finals; finally complete EMT annotations. Invalid/missing duration remains null. | `analysis/playTime.ts` → `durationRepository.ts` cache → `usePlayTime.ts` → `analytics/playTime.ts`. Duration sums only known eligible observations; coverage is shown. Sessions require exact Start/End intervals and do not bridge unknown intervals. |
| Mistakes | Completed player PGN replay → bundled Stockfish 18.0.8 lite | Current format/version/nodes/fingerprint checked; invalid/unsupported PGNs skipped. No engine runs on live games or puzzles. | `selection.ts` → saved queue → offscreen `engineHost.ts` → `engine.ts`/`evaluation.ts` → analyses/findings. Approximate cp/mate heuristics; thresholds 50/100/200 cp with losing-position suppression. |
| Reviews | User's Again/Hard/Good/Easy response | Missing review means immediately due; intervals 1/3/7/21 days; account isolated. | `mistakeReviews` stores history; mastered requires three consecutive successes and Easy interval. |

## Storage, cache and synchronization

- IndexedDB `chess-insights-db` version 4 stores games, archive/user metadata,
  analytics metadata, puzzle attempts/tracking, clock/duration analysis, engine
  results/findings/reviews and queues. Upgrades add absent stores without clearing
  populated ones. Every user data store has a username index.
- Game identity is `{lowercase account}:{uuid | game URL | player/time fallback}`;
  monthly records are deduplicated by that ID and upserted atomically with archive
  metadata. The index yields monthly archives, not numbered pages. Public archive
  totals are not a lifetime count; unsupported/uncompleted records are excluded.
- API requests are serialized, omit cookies, have a 20-second fetch timeout and at
  most four attempts for 429 with bounded backoff. Malformed JSON/index/month shape
  fails explicitly; prior cached months remain available. Per-account sync locks
  serialize concurrent tabs. The archive index TTL is one hour, current month TTL
  five minutes, manual-refresh cooldown 30 seconds and rollover settle window 24h.
- Month fingerprints advance the user version only on source changes. Snapshot
  PGNs are redacted but duration fingerprints retained. Full PGNs remain necessary
  for local historical replay; retention is local and no history upload exists.
- Duration/clock/engine caches include parser/engine settings and source
  fingerprints. Selection previews are bounded per account and version; eligibility
  reuse verifies exact PGN/player metadata. Weak visual-summary caches are keyed by
  immutable array identity. Settings writes are serialized partial merges.
- User-facing hooks use account/generation guards; game sync preserves cached
  snapshots on failure. Puzzle snapshots/events update cross-tab views. Engine
  state and eligibility are separate; compatible saved results load before PGN
  scans. Eligibility polling skips hidden tabs and refreshes on visibility return;
  each hook removes its listener and timer on unmount.

## Integration and failure boundaries

`chessComContent.tsx` owns one content controller, page observer, puzzle tracker,
homepage root and Insights root. Stable semantic anchors locate Play Online,
Recommended Match/Daily Puzzle and navigation. `pageObserver.ts` reconciles DOM,
history and sidebar changes; `integration.ts` disposes React roots and placement
styles when leaving a route. React charts are SVG/DOM, not external chart objects.
ResizeObservers and hooks own their listeners/timers. Every owner/disposal path is
checked separately in the audit; an architecture description does not establish
that cleanup is correct.

Production manifest uses only storage/offscreen and two Chess.com hosts. There is
no injected main-world script, remote executable CDN, `externally_connectable`,
optional permission or web-accessible resource declaration. Runtime messages cross
content/background/offscreen trust boundaries and are a separate security test
surface. A failed section/heatmap has a retry fallback; Insights account controls
and navigation stay mounted. Unsupported authenticated layouts remain a manual
integration check; fixture success cannot establish clean-profile installation.

## Observer, listener and timer ownership

| Owner | Target / trigger | Frequency / work | Cleanup |
| --- | --- | --- | --- |
| `observePage` | Stable `document.documentElement`, subtree children/text and filtered attributes; route/resize/click events | Coalesced 180 ms reconciliation. Watching the stable root permits body/sidebar replacement. Own React mutations are ignored; this callback does not fetch history or aggregate statistics. | Content controller disconnects observer, clears pending timeout and removes the same callbacks. |
| Puzzle tracker | Current identifiable rated-puzzle completion root; eligible subtree metadata only | 80 ms coalescing, at most 3 delayed save retries. The observer switches/disconnects when the route/root changes. | Tracker disposal disconnects, cancels the timeout and removes DOM/storage listeners. |
| Homepage placement | Relevant native layout elements via `ResizeObserver` | Geometry only while the homepage surface exists. | Integration disposal / leaving Home disconnects and restores placement styles. |
| Heatmap and SVG charts | Their own container via `ResizeObserver` | Width/tooltip positioning; no external chart instance/canvas. | React effects disconnect on unmount. |
| `useAnalysis` | Mistakes eligibility while enabled | One initial preview, then 5 s polling only when visible; visibility return refreshes immediately; in-flight previews coalesce. | Effect clears interval and removes `visibilitychange`. |
| `MistakesPage` | Saved progress, live-context guard, visibility/pagehide | 1 s progress poll skips hidden tabs; 250 ms safety guard; hiding/leaving pauses the owned engine. These timers exist only while Mistakes is mounted. | Cleanup clears both intervals, removes listeners and stops/pauses the owned host. |
| Local engine | Worker UCI responses, offscreen page lifetime | Commands have bounded timeouts; yielding occurs between parsing batches. Offscreen pagehide stops worker and releases the run token. | Command completion/error clears its timeout; stop terminates the worker. |
| Engine startup | One delayed startup watchdog | Checks the same run token and initializing status before changing an orphaned queue; no recurring poll. | Finite timer expires; stale tokens cannot alter a newer run. |
| API / download helpers | Serialized 429 backoff; exported object URL | Bounded retries; URL revoke after 1 s. | Finite timeout, no perpetual interval. |

Other state/route hooks remove hash, local-update and Chrome storage listeners in
their effect cleanups. Detached sidebar links own only their element listener and
do not retain a window/document listener. See the lifecycle report for measured
resource counts; this ownership map is not a browser heap-retention result.
