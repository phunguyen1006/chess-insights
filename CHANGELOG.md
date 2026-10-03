# Changelog

## [0.1.9](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.9) — 2026-10-03

### Changed

- Replace all six analysis scopes with **Unanalyzed games**, covering all cached history independently of page filters. Opening Mistakes loads available archive years.
- Show exact pending, already-analyzed and unsupported counts from stored PGNs and current engine/source versions. A completed old batch no longer hides remaining games.
- Remove the reanalysis checkbox from this workflow, queue every eligible pending game without a 10/20-game cap, and retain pause/resume and completed results.
- Add Settings → Appearance → **Light mode / Dark mode**, stored on the device and synchronized across open Insights/homepage surfaces. Theme colors cover charts, tooltips, tables, filters, review controls and heatmaps.
- Yield PGN eligibility checks in small batches and reuse source-aware results during progress polling.

No new permissions, dependencies or database schema changes. Existing data and reviews are retained. See [verification and manual integration checks](docs/QA-0.1.9.md).

## [0.1.8](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.8) — 2026-10-03

Observed Play Time, Sessions and an Insights redesign following Chess.com's native Stats composition. No new permissions or dependencies.

### Added

- Validated PGN Start/End, clock reconstruction and elapsed-move duration sources; explicit coverage, Daily exclusion and unavailable values instead of nominal-control estimates.
- Additive IndexedDB v4 duration cache with parser/fingerprint invalidation, yielding batches, cached-first rendering and account/stale-reply protection.
- Overview Play Time, a separate Activity duration heatmap, monthly/pool/distribution/longest-game charts and Play Time Highlights.
- Observed-interval Sessions with a 30-minute gap, separate span/game time, coverage, per-pool rating changes and performance by game number.

### Changed

- Native-style shared shell, pool/period selectors, green tab underlines, cyan area trends, compact summary rows, gray Highlights headers and structured tables.
- Rating adds color segments, Highlights and Average Opponent Rating. Time uses Overview / Play Time / Clock Usage / Time Pressure / Sessions.
- Results, Openings, Opponents and Mistakes emphasize semantic horizontal comparisons, table rows and contextual detail sections. Existing clock analytics, engine queues, review and puzzle features remain available.

### Validation

333 tests in 43 files pass, plus typecheck, ESLint and production build verification. Public PGN duration calculations, additive migrations, cache/runtime/session regressions, desktop/390px visual checks and real local Stockfish review are documented in [the implementation and QA report](docs/QA-0.1.8.md).

## [0.1.7](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.7) — 2026-10-03

Puzzle-history portability, filtered game export and review-session fixes. No new permissions or database schema changes.

### Added

- Download a per-account puzzle JSON backup and preview a validated import before merging missing attempts. Existing attempt IDs, tracking settings and the current tracking/Clear boundary are preserved.
- Reject malformed, mismatched-account and conflicting backup records; enforce 20 MB and 50,000-attempt limits and roll back failed imports without partial writes.
- Show restored attempts before the current tracking boundary while marking their coverage as potentially incomplete. Backups restore saved records only; they do not retrieve earlier history from Chess.com or include games, analyses, reviews or settings.
- Export the current filtered cached games as a 16-column UTF-8 CSV, with quoting, spreadsheet formula protection and account/filter change guards.

### Fixed

- Resume the existing pending engine queue from the primary Retry button instead of replacing it with a newly selected scope.
- Ignore late grading responses after closing or changing a review session, and reset the revealed answer when starting another review.

### Validation

258 tests in 32 files pass, plus typecheck and ESLint. See [QA evidence and manual scope](docs/QA-0.1.7.md) for build and browser verification.

## [0.1.6](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.6)

Project-wide correctness and regression-test pass. No new permissions or database schema changes.

### Fixed

- Recover a removed heatmap and replaced native cards without crashing or duplicating mounts.
- Preserve queued sync requests after failures and retain manual refresh intent; use UTC archive boundaries and refetch newly closed months after PubAPI's cache window.
- Serialize partial settings updates, reject malformed archive/profile metadata, and close abandoned blocked database connections.
- Order puzzle save/OFF/Clear operations; reject old completions after Clear and skip hidden/stale result metadata and unobserved puzzle transitions.
- Reset puzzle sessions and clear confirmations across accounts; tolerate malformed session storage.
- Prevent duplicate engine startup, stale worker/watchdog updates and Pause/Cancel races during initialization; wait for stop cleanup before resuming.
- Preserve concurrent review history, prevent double grading and ignore callbacks from previous accounts.
- Recover loading state after a cache error during an account switch; clamp month filters at month ends.
- Remove the redundant homepage footer text and avoid collecting layout diagnostics in production.
- Verify every required runtime asset and synchronized source/build/lockfile versions before packaging; reject incomplete/debug releases.
- Fix the Vite development version import and stop generated release ZIPs from crashing the Windows file watcher.
- Update pinned official CI actions to the Node.js 24 runtime after GitHub reported deprecated Node.js 20 actions.

### Validation

209 tests in 29 files pass (51 additional regression tests), plus typecheck and ESLint. Local Stockfish WASM, all Insights sections, desktop/390px layout, SPA mounting and production packaging are verified. See [QA evidence and manual scope](docs/QA-0.1.6.md).

## [0.1.5](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.5) — 2026-10-01

First GitHub preview release of the existing standalone extension.

### Added

- Local rated-puzzle completion tracking, per-account coverage dates, deduplication across rerenders/refresh and cross-tab activity updates.
- Games + Puzzles homepage calendar, union active days/streaks and independent activity intensity.
- All Activity / Games / Puzzles views, puzzle outcome/success statistics, monthly/weekday charts, observed rating history and records.
- Tracking ON/OFF setting and separate confirmed clearing of puzzle history.
- Additive IndexedDB v3 migration; all v2 game, analysis and review data is preserved.
- Release ZIP/checksum packaging, complete license notices and pinned GitHub Actions CI.

### Fixed

- Full-width heatmap placement beneath Play Online and above both Recommended Match and Daily Puzzle.
- Sidebar Insights mounting across native navigation/remounts.
- Duplicate failed attempts when reviewing a puzzle solution; overlapping pending puzzle writes.
- Insights native-content hiding against stronger native grid display rules.

### Existing features included

Overview, Activity, Rating, Openings, Opponents, Results, PGN clock analytics and a local Stockfish Mistake Bank for completed stored games.

### Known limits

Puzzle history before tracking begins is unavailable. Only rated training is supported. Ambiguous completion/next-puzzle metadata is skipped. Authenticated puzzle DOM and very narrow layouts still need manual validation. Clock/engine analytics are approximate and depend on completed PGN/clock availability; they are not Chess.com Game Review.
