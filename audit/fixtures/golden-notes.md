# Hand-inspectable golden controls

Synthetic user only. Completion dates are converted from the UTC column to the selected local timezone.

| ID | UTC completion | Pool | Result | Color | Known duration seconds |
| --- | --- | --- | --- | --- | --- |
| g01 | 2023-12-31T16:59:00Z | rapid | win | W | 10 |
| g02 | 2023-12-31T17:01:00Z | rapid | loss | B | 20 |
| g03 | 2024-02-28T16:59:00Z | rapid | draw | W | 30 |
| g04 | 2024-02-28T17:01:00Z | rapid | win | B | 40 |
| g05 | 2024-02-29T16:59:00Z | rapid | loss | W | 50 |
| g06 | 2024-02-29T17:01:00Z | rapid | win | B | 60 |
| g07 | 2024-03-10T06:59:00Z | rapid | draw | W | 70 |
| g08 | 2024-03-10T07:01:00Z | rapid | win | B | 80 |
| g09 | 2024-11-03T05:59:00Z | rapid | loss | W | 90 |
| g10 | 2024-11-03T06:01:00Z | rapid | win | B | 100 |
| g11 | 2024-12-31T16:59:00Z | blitz | loss | W | 110 |
| g12 | 2024-12-31T17:01:00Z | blitz | win | B | 120 |
| g13 | 2025-01-01T23:30:00Z | blitz | draw | W | 130 |
| g14 | 2025-01-01T23:40:00Z | blitz | win | B | 140 |
| g15 | 2025-01-01T23:50:00Z | blitz | loss | W | 150 |
| g16 | 2025-01-02T00:30:00Z | blitz | win | B | 160 |
| g17 | 2025-01-02T00:40:00Z | blitz | draw | W | 170 |
| g18 | 2025-01-02T00:50:00Z | blitz | win | B | 180 |
| g19 | 2026-09-29T17:30:00Z | bullet | win | W | 190 |
| g20 | 2026-09-29T17:40:00Z | bullet | loss | B | 200 |
| g21 | 2026-09-29T17:50:00Z | bullet | draw | W | 210 |
| g22 | 2026-09-30T17:30:00Z | bullet | win | B | 220 |
| g23 | 2026-09-30T17:40:00Z | bullet | loss | W | unknown |
| g24 | 2026-09-30T17:50:00Z | bullet | win | B | unknown |
| g25 | 2026-10-01T17:30:00Z | daily | draw | W | Daily excluded |
| g26 | 2026-10-01T17:40:00Z | daily | win | B | Daily excluded |
| g27 | 2026-10-01T17:50:00Z | daily | loss | W | Daily excluded |
| g28 | 2026-10-02T17:30:00Z | daily | draw | B | Daily excluded |
| g29 | 2026-10-02T17:40:00Z | daily | win | W | Daily excluded |
| g30 | 2026-10-02T17:50:00Z | daily | draw | B | Daily excluded |

Literal expected values are maintained in golden-expected.json. The generator does not call the extension or derive those controls from a calculation implementation. g23 has no reliable source; g24 has a corrupt negative interval. g25–g30 are Daily and excluded from played time. Every known interval ends exactly at raw end_time. Two extra game records repeat IDs; invalid records include a far-future completed game. Puzzle IDs distinguish separate attempts at the same puzzle, and one repeated ID is duplicate. Two puzzle-only days extend the combined current streak to five.
