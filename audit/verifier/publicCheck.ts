// Real public input is retained only in ignored audit/temp/, never in release files.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  getArchiveIndex,
  getMonthlyArchive,
} from "../../src/data/api/chessComApi";
import { normalizeGame } from "../../src/data/normalize/normalizeGame";
import { extensionMetrics } from "./collectExtension";
import type { NormalizedGame } from "../../src/shared/types";
const output = [];
const zones = ["UTC", "Asia/Bangkok", "Etc/GMT+5", "America/New_York"];
for (const username of ["erik", "hikaru", "magnuscarlsen"]) {
  const path = `audit/temp/${username}`,
    asOf = new Date().toISOString();
  mkdirSync(path, { recursive: true });
  try {
    const archives = await getArchiveIndex(username),
      last = archives.at(-1);
    const [year, month] = last?.split("/").slice(-2).map(Number) ?? [];
    const raw = last ? await getMonthlyArchive(username, year, month) : [];
    writeFileSync(
      `${path}/raw.json`,
      JSON.stringify({
        username,
        asOf,
        games: raw,
        puzzles: [],
        evaluations: [],
      }),
    );
    execFileSync(
      "python",
      [
        "audit/verifier/independent.py",
        "--input",
        `${path}/raw.json`,
        "--reports",
        path,
        "--oracle-only",
        "--skip-hand-controls",
      ],
      { stdio: "pipe" },
    );
    const checks = [];
    for (const zone of zones) {
      process.env.TZ = zone;
      const normalized = raw.flatMap((r) => {
          const g = normalizeGame(r, username);
          return g ? [g] : [];
        }),
        games = [...new Map(normalized.map((g) => [g.id, g])).values()].sort(
          (a, b) => a.endTime - b.endTime || a.id.localeCompare(b.id),
        );
      const ext = extensionMetrics(games as NormalizedGame[], [], []),
        oracle = JSON.parse(
          readFileSync(
            `${path}/independent-${zone.replaceAll("/", "_")}.json`,
            "utf8",
          ),
        );
      const keys = [
        "games",
        "wins",
        "losses",
        "draws",
        "winRate",
        "rapid",
        "blitz",
        "bullet",
        "daily",
        "unknown",
        "gameActiveDays",
        "gamesPerActiveDay",
        "currentGameStreak",
        "longestGameStreak",
        "weekdays",
        "hours",
        "activityMonths",
        "heatmap.games",
        "openings",
        "opponents",
        ...["rapid", "blitz", "bullet", "daily", "unknown"].flatMap((p) => [
          `pool.${p}`,
          `rating.${p}`,
          `ratingSeries.${p}`,
          `rolling3.${p}`,
        ]),
        "ending.win",
        "ending.loss",
        "ending.draw",
      ];
      // Compare recursive values; floats alone permit 1e-10 arithmetic tolerance.
      const eq = (a: unknown, b: unknown): boolean => {
        if (typeof a === "number" && typeof b === "number")
          return Number.isInteger(a) && Number.isInteger(b)
            ? a === b
            : Math.abs(a - b) <= 1e-10;
        if (a && b && typeof a === "object" && typeof b === "object") {
          const ak = Object.keys(a),
            bk = Object.keys(b);
          return (
            ak.length === bk.length &&
            ak.every(
              (k) =>
                k in b &&
                eq(
                  (a as Record<string, unknown>)[k],
                  (b as Record<string, unknown>)[k],
                ),
            )
          );
        }
        return a === b;
      };
      const failed = keys.filter((k) => !eq(ext[k], oracle[k]));
      if (failed.length)
        writeFileSync(
          `${path}/extension-${zone.replaceAll("/", "_")}.json`,
          JSON.stringify(ext),
        );
      checks.push({
        zone,
        comparedMetricGroups: keys.length,
        status: failed.length ? "FAIL" : "PASS",
        failed,
      });
    }
    output.push({
      publicUsername: username,
      archiveMonths: archives.length,
      sampledArchive: `${year}-${String(month).padStart(2, "0")}`,
      rawGames: raw.length,
      checks,
    });
  } catch (error) {
    output.push({
      publicUsername: username,
      status: "UNVERIFIED",
      error: String(error),
    });
  }
}
writeFileSync(
  "audit/reports/public-check.json",
  JSON.stringify(
    {
      asOf: new Date().toISOString(),
      scope:
        "Latest public archive only; not full account history. Independent raw WDL, pools, rating observations, local calendars, openings, opponents and endings. No historical puzzle API, live rating or public-duration claim.",
      profiles: output,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(output, null, 2));
if (
  output.some(
    (p) => "checks" in p && p.checks?.some((c) => c.status === "FAIL"),
  )
)
  process.exitCode = 1;
