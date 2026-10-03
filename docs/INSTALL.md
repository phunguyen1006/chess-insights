# Install and update Chess Insights

## First installation — Edge or Chrome

1. Download `chess-insights-v0.1.8.zip` from the [GitHub release](https://github.com/phunguyen1006/chess-insights/releases/tag/v0.1.8). The automatically generated **Source code** archives are source, not a ready-to-load extension.
2. Extract the ZIP into a permanent folder. Keep the extracted files together. The folder you load must contain `manifest.json` directly.
3. Open `edge://extensions` or `chrome://extensions` in your normal browser profile and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder. This project is currently distributed as an unpacked extension, not a browser-store listing.
5. Reload your Chess.com tabs. Use your normal signed-in session; no separate login or cloud account is required by Chess Insights. If public game-account detection fails, enter a public username in the Connect form.

## Update an existing installation and retain local data

1. Note the directory used by the existing unpacked extension. If it already supports puzzle backups (v0.1.7 or later), download one from Settings before replacing files.
2. Close Chess.com tabs, extract the new ZIP to a temporary directory and replace the extension files in the **same existing extension directory**. Do not uninstall the extension, change its directory, clear extension storage or load a second copy.
3. Click **Reload** on the existing extension card, then reopen/reload Chess.com. v0.1.8 adds a duration cache in database version 4. The upgrade preserves games, archives, puzzles, analysis, reviews and settings; no storage reset is needed.
4. The homepage calendar should appear below Play Online and above Recommended Match + Daily Puzzle. Insights should be present in the sidebar on native navigation pages.

## Puzzle tracking check

Record the Home puzzle count, complete one rated puzzle successfully, and verify +1 in the already-open Home tab. Fail the next rated puzzle and check Activity → Puzzles: attempts +2 relative to the starting count, solved +1, failed +1. Viewing the failed puzzle's solution must not create an extra solved attempt. Refresh and verify persistence.

Puzzle history starts when the extension detects the signed-in account with tracking enabled. Earlier puzzle history cannot be reconstructed through PubAPI; only previously recorded attempts in a saved backup can be restored. Daily Puzzle, Rush and Battle are excluded. Settings → Track puzzle activity can be disabled while keeping existing data. Clear puzzle history requires confirmation and is separate from game data.

## Back up and restore puzzle history

To save a backup:

1. Open **Insights**, select the intended Chess.com username, then open **Settings**.
2. Under **Puzzle history backup**, choose **Download puzzle backup**.
3. Keep the downloaded JSON file in a safe location. It contains that account's recorded puzzle attempts and tracking metadata.

To restore a backup:

1. Select the same username in Insights and open **Settings → Puzzle history backup**.
2. Use **Choose puzzle backup** to select the JSON file. Check the account, attempt count and date range in the preview.
3. Choose **Merge puzzle history**. The result reports how many attempts were added and how many already existed. **Cancel import** closes the preview without changing history.

Import adds missing attempt IDs and keeps existing attempts unchanged. Importing the same backup again does not duplicate attempts. Invalid files, a different account, conflicting duplicate IDs and files larger than 20 MB are rejected; the merged history cannot exceed 50,000 attempts. A failed import does not partly update the database.

Restoring keeps the current tracking setting and current tracking/Clear boundary. A fresh destination starts its coverage boundary at import time. Restored older attempts remain visible, but they do not prove that all activity on those days was recorded. Original local calendar dates are preserved, including when restoring in another timezone. Clearing and then deliberately importing a backup can restore the saved attempts.

**This is a puzzle-history backup.** It excludes games, engine analysis, review schedules and settings, and cannot retrieve unrecorded history from Chess.com. Keep the same extension identity to retain those other local records. Backup files are processed locally and are not uploaded.

## Export filtered games to CSV

1. Open a game analytics section, or choose **Games** in Activity.
2. Set the desired filters and wait for loading to finish. Open History, exports and data coverage at the bottom of Insights. **Export games CSV** shows the number of cached games included.
3. Choose **Export games CSV** and open the downloaded file in your spreadsheet app.

The CSV contains 16 columns: completion time (UTC), local date, username, opponent, result, player color, player rating, opponent rating, time class, time control, rated status, termination, ECO, opening, variation and game URL. It uses UTF-8, quotes CSV fields and protects text cells from spreadsheet formula interpretation. Export does not fetch additional archives and is not an importable extension backup. The button is disabled when the current selection has no games or is loading.

## Verification and reporting

You can verify a download with `SHA256SUMS.txt`. In PowerShell use `Get-FileHash .\chess-insights-v0.1.8.zip -Algorithm SHA256`; on Linux use `sha256sum -c SHA256SUMS.txt`.

This is an early release. Automated tests cover export/import validation, storage rollback and review behavior; authenticated Chess.com completion panels and extension offscreen delivery require final browser verification. See the [version-specific QA report](https://github.com/phunguyen1006/chess-insights/blob/main/docs/QA-0.1.8.md) for completed local/browser checks. If a puzzle is missed or placement differs, open a GitHub issue with browser/version, extension version, route, expected/actual behavior and a screenshot of the relevant interface. The tracker never supplies puzzle answers or starts an engine on active puzzles.
