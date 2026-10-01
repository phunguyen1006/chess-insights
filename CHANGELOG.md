# Changelog

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
