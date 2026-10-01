# Install and update Chess Insights

## First installation — Edge or Chrome

1. Download `chess-insights-v0.1.5.zip` from the [GitHub release](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.5). The automatically generated **Source code** archives are source, not a ready-to-load extension.
2. Extract the ZIP into a permanent folder. Keep the extracted files together. The folder you load must contain `manifest.json` directly.
3. Open `edge://extensions` or `chrome://extensions` in your normal browser profile and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder. This project is currently distributed as an unpacked extension, not a browser-store listing.
5. Reload your Chess.com tabs. Use your normal signed-in session; no separate login or cloud account is required by Chess Insights. If public game-account detection fails, enter a public username in the Connect form.

## Update an existing installation and retain local data

1. Note the directory used by the existing unpacked extension.
2. Close Chess.com tabs, extract the new ZIP to a temporary directory and replace the extension files in the **same existing extension directory**. Do not uninstall the extension, change its directory, clear extension storage or load a second copy.
3. Click **Reload** on the existing extension card, then reopen/reload Chess.com. The v2 → v3 IndexedDB upgrade preserves games, archives, analysis, reviews and settings.
4. The homepage calendar should appear below Play Online and above Recommended Match + Daily Puzzle. Insights should be present in the sidebar on native navigation pages.

## Puzzle tracking check

Record the Home puzzle count, complete one rated puzzle successfully, and verify +1 in the already-open Home tab. Fail the next rated puzzle and check Activity → Puzzles: attempts +2 relative to the starting count, solved +1, failed +1. Viewing the failed puzzle's solution must not create an extra solved attempt. Refresh and verify persistence.

Puzzle history starts when this build detects the signed-in account with tracking enabled. Earlier puzzle history cannot be reconstructed through PubAPI. Daily Puzzle, Rush and Battle are excluded. Settings → Track puzzle activity can be disabled while keeping existing data. Clear puzzle history requires confirmation and is separate from game data.

## Verification and reporting

You can verify a download with `SHA256SUMS.txt`. In PowerShell use `Get-FileHash .\chess-insights-v0.1.5.zip -Algorithm SHA256`; on Linux use `sha256sum -c SHA256SUMS.txt`.

This is an early release: the local fixture and automated tests pass, while authenticated Chess.com completion panels and narrow-window sizing require final browser verification. If a puzzle is missed or placement differs, open a GitHub issue with browser/version, extension version, route, expected/actual behavior and a screenshot of the relevant interface. The tracker never supplies puzzle answers or starts an engine on active puzzles.
