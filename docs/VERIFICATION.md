# Verification

## Current version — 0.1.6

The project-wide QA pass fixed reproduced data, puzzle, engine, navigation, account-state and release-packaging failures. **209 tests / 29 files**, typecheck and ESLint pass. Local desktop and 390px checks now pass, including all Insights sections; real bundled Stockfish WASM initializes and evaluates a position. See [the full QA report](QA-0.1.6.md) for causes, tests, measurements and remaining authenticated/offscreen manual scope.

The evidence below records the original 0.1.5 feature verification.

## Verified automatically/local fixture

- 158 tests in 21 files: analytics, game cache/sync, account isolation, DOM/sidebar mounting, UI/filter behavior, engine authorization/startup, review lifecycle, puzzle observer/storage and additive populated v2 → v3 migration.
- Typecheck, ESLint, normal production build, debug build and production fixture-exclusion checks passed.
- Puzzle observer fixture: no initialization save; one solved and one failed completion yielded exactly two attempts and 50% success. Refresh preserved data. Failure then solution review did not create a solved duplicate.
- A third completion in another fixture tab changed the open Home count from 2 to 3 without reload.
- Play and heatmap widths both 1057 px, matching the combined Recommended Match + Daily Puzzle outer width within 0.02 px. Heatmap was below Play and above both cards; one heatmap and one Insights item were present with no desktop horizontal overflow.
- Only public `erik` game data and synthetic completion metadata were used. Screenshots below are development fixtures, not a production authenticated Chess.com session.

![Combined homepage fixture](images/home-activity.png)

![Puzzle activity fixture](images/puzzle-activity.png)

## Requires authenticated manual verification

The public rated puzzle page was inspected without login; its rated sidebar anchors were visible, but the authenticated result panel was unavailable. Account detection, localized solved/failed feedback, optional rating fields and Next Puzzle transitions must still be checked in a normal signed-in Edge/Chrome profile. Ambiguous signals are skipped. A 390 px viewport override did not apply in the development browser, so no 390 px browser verification is claimed.

Tracking starts at the actual saved timestamp/local date for each account. The fixture's start was October 1, 2026; production users get their own start date when tracking first detects them. Older puzzle attempts and gaps while tracking is disabled/absent cannot be reconstructed.

Follow the [manual installation and puzzle check](INSTALL.md). No separate development-browser Chess.com login is required.
