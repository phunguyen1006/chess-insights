# v0.1.9 verification

## Changes and root causes

The earlier UI could show "Analysis Complete" for a finished 20-game batch even when other games remained unanalyzed. Scope selection did not preview eligible counts, and its game list depended on page filters. Six scopes and the reanalysis checkbox have been replaced by one **Unanalyzed games** scope.

Opening Mistakes requests all available public archive years. Analysis selection uses stored full PGNs for the account, independently of the UI filters. Charts and the review bank still respect page filters. The same selector previews counts and constructs the queue, without a game-count cap. Compatible analysis requires the current analysis version, engine version, node budget and PGN fingerprint. Unsupported variants, malformed/incomplete PGNs, missing player headers and positions with no player moves are excluded. Complete results remain saved; an old completed batch no longer disables the next batch.

Selection checks yield in small batches. A versioned per-account game cache and source-aware weak eligibility cache avoid repeatedly loading/replaying every PGN during progress polling. Existing pause/resume, cancellation, ownership and historical-route guards remain. Orphan detection also checks paused queues with a stale running flag so they can recover instead of leaving Resume disabled.

The existing dark colors were overridden by later light-only shell styles. Appearance now offers exactly **Light mode / Dark mode**, saved through serialized extension settings writes. Updates preserve account and puzzle preferences and notify other open surfaces. Explicit colors cover cards, text, filters, native controls, table stripes, chart grids/labels/tooltips, review controls and heatmaps. Chessboard piece colors remain independent of the surface theme. The host site's own UI and wallpaper are not recolored.

## Automatically verified

- **343 tests in 45 files pass**, plus TypeScript, ESLint, production build and release-package verification.
- A 129-game account fixture: 125 eligible games, one already analyzed, four unsupported/malformed records, exactly 124 queued. Supplying one filtered ID and a force flag does not narrow or reanalyze the Unanalyzed scope. Another account is excluded.
- Completion of those eligible games produces zero pending; empty and unsupported histories do not start a worker.
- PGN changes and outdated engine/node/version records invalidate cached results; newly synchronized archives refresh counts.
- Finished old batches expose remaining games, cold count loading and history synchronization disable startup, paused/error queues retain their saved IDs, and stale engine flags trigger recovery.
- Light/Dark persistence across remount, local cross-surface events, concurrent account/puzzle/theme writes, invalid theme rejection, failed-write recovery and preservation of existing preferences.
- Existing migration, clock, duration, session, puzzle, review, navigation and engine lifecycle regressions remain covered. No permissions, dependencies or database stores were added.

## Local browser fixture verified

Testing uses public `erik` PGNs and existing local test analysis records. It does not require a Chess.com login or expose the user's authenticated history.

- Initially 193 stored games, 41 compatible analyses and **152 pending**. The new queue contains all 152 games. Real bundled Stockfish processed **50 games in that single queue**, leaving 102 pending and retaining 91 analyses overall; the run was interrupted for development reloads. The larger queue was not allowed to finish all 152 games during visual QA; full zero-pending completion is covered by the controlled storage test.
- Settings switches both directions, and Dark mode is retained after reload. Homepage renders one dark heatmap with the saved preference.
- Desktop 1280 × 900 and narrow 390 × 844 checks show no document-level horizontal overflow. Section navigation can scroll inside its own container on narrow screens.
- Dark root colors observed: background `rgb(38,36,33)`, text `rgb(241,240,237)`. Gray section headers, table surfaces, native selects and cyan Daily rating charts remain legible.

| View               | Screenshot                                        |
| ------------------ | ------------------------------------------------- |
| Light settings     | [Light](images/appearance/light-settings.jpg)     |
| Dark settings      | [Dark](images/appearance/dark-settings.jpg)       |
| Dark rating chart  | [Daily rating](images/appearance/dark-rating.jpg) |
| Narrow dark layout | [390px](images/appearance/dark-mobile.jpg)        |

## Final manual verification in authenticated Edge

Update the existing extension folder and reload the extension and Chess.com. Confirm version 0.1.9, the single analysis option, the all-history pending count, successful production offscreen-engine startup, pause/resume after reload, and theme persistence on the actual Chess.com DOM. Existing homepage placement and sidebar navigation should also be checked against the user's current site layout. These authenticated integration checks remain manual; local fixture verification does not establish them.

Keep Mistakes visible and the device awake for unattended analysis. Hiding the tab, leaving Mistakes, or entering a live-game context pauses the engine. Saved completed games are reused on Resume. Public archives can lag, and failed archive requests leave the available cached history intact.
