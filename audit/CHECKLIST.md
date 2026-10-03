# Final audit checklist — v0.1.11 candidate

Baseline `a8b7455b9f31ab289266dc76e21eee9fd7cff455`; branch
`codex/final-release-audit`. Overall **NOT RELEASE READY**.
See [FINAL-AUDIT.md](../FINAL-AUDIT.md) for findings and evidence scope.

| Gate | Evidence | State |
| --- | --- | --- |
| Architecture/data flow | Source fields, null/timezone/cache semantics and owners in docs/DATA-FLOW.md | Documented |
| Independent verifier | Python raw oracle and actual extension, 1,399 comparisons | PASS |
| Golden dataset | 30 games, hand-counted controls, 12 puzzles, evaluation pairs | PASS |
| Heatmap | Rendered calendars, sums, all modes, leap/year/midnight/future/duplicates | PASS |
| Time | Independent explicit headers; literal clock/EMT/missing/Daily regressions | PASS, stated scope |
| Timezone | UTC, UTC+7, UTC−5 and New York DST | PASS |
| Archives/deduplication | 0/1/49/50/51/1k/5k, multi-year and account/tab races | PASS |
| Statistics/charts | Counts, denominators, ratings, openings, endings, calendar marks | PASS, tested data |
| Empty/malformed/errors | Existing UI/API tests, future rejection, error boundary, validation | PASS |
| SPA/lifecycle | 30 loops/240 transitions, bounded resources, disposal and idle | PASS, local DOM |
| Race/cache/migration | Stale replies, isolation, upgrades, 108 saved analyses | PASS, automated storage |
| Security controls | Manifest/XSS/messages, strict credential formats and artifact inventory | PASS, limited controls |
| Independent Codex Security scan | Direct-start failure, no scan ID/provider report | UNVERIFIED |
| Dependency advisories | Lockfile registry audit, 0 vulnerabilities | PASS |
| Computational performance | 1k/5k/10k games and 50k attempts, before/after | PASS, Node/jsdom |
| Browser performance/memory | Resource cleanup measured; no heap/long-task/Slow-3G profile | UNVERIFIED |
| Responsive/themes/keyboard | 48 CSS viewport samples, two themes, three tabs, ArrowRight/Enter | PASS, fixture |
| Actual zoom/authenticated layout | CSS viewport is not zoom/DPR; no authenticated native DOM | UNVERIFIED |
| Clean-profile install | Actual production MV3 install/restart/update unavailable | UNVERIFIED |
| Regression/build/artifact | 381 tests/59 files, clean build, 23-entry ZIP/checksum/licenses | PASS, build/package |

Seven confirmed findings fixed: Medium 5, Low 2, Critical/High 0 found.
Mandatory unverified checks remain open. No stable tag/release created.
