# Changelog

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
