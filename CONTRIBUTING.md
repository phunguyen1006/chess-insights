# Contributing

Use Node.js 22.12+ (CI uses 24), run `npm ci`, and work on a branch. Before proposing a change, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. Changes should preserve account isolation, local data and existing extension identity. Database upgrades must be additive and tested against populated older stores.

The local fixture uses public game history for `erik`. `npm run dev`, then open `/home?puzzles=fixture` for synthetic completion-only puzzle controls; `?layout=reported-grid` exercises the native two-column grid contract. Use `?presentation=stats` for the light reference sidebar used in native Stats screenshots, and `?navigation=native-shell` for route/sidebar remount checks. These parameters can be combined. Fixtures and their records never ship in the production bundle. Do not introduce active-game/puzzle engine calls, hints, solution extraction, private endpoints or telemetry.

Bug reports should describe browser/extension version, route, reproduction steps, expected/actual result and the affected UI. Distinguish local fixture evidence from authenticated browser verification. Feature requests should explain the user outcome and data source. Contributions are submitted under the repository's GPL-3.0-only license; preserve third-party notices.

## Preparing a release

1. Update `package.json`, the root package-lock metadata and `public/manifest.json` to the same version. Add changelog and `docs/releases/vVERSION.md` notes.
2. Run `npm ci`, all checks and `npm run build`; `npm run release:pack` creates the installable ZIP and `releases/SHA256SUMS.txt`. Debug builds are rejected by the packager.
3. Verify the ZIP contains `manifest.json` at its root, scripts, stylesheet, icons, local engine assets, upstream engine source/license and installation/license notices.
4. Commit reviewed source, push the default branch and confirm GitHub CI succeeds. Create an annotated `vVERSION` tag on the verified commit and push it.
5. Publish the GitHub release with both assets and the corresponding notes. Mark preview builds as pre-releases. Verify the release page, tag SHA, published assets/checksum and downloaded ZIP before reporting success.
