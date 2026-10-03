// @vitest-environment jsdom
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { aggregateOpenings } from "../src/analytics/openings";
import { aggregateOpponents } from "../src/analytics/opponents";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { OpeningsPage } from "../src/features/insights/pages/OpeningsPage";
import { OpponentsPage } from "../src/features/insights/pages/OpponentsPage";
import { OverviewPage } from "../src/features/insights/pages/OverviewPage";
import { defaultFilters } from "../src/analytics/results";
it("keeps the manifest restricted to its documented local-storage and engine needs", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  expect(manifest.permissions).toEqual(["storage", "offscreen"]);
  expect(manifest.host_permissions).toEqual([
    "https://www.chess.com/*",
    "https://api.chess.com/*",
  ]);
  expect(manifest.content_scripts[0].matches).toEqual([
    "https://www.chess.com/*",
  ]);
  for (const key of [
    "optional_permissions",
    "web_accessible_resources",
    "externally_connectable",
  ])
    expect(manifest[key]).toBeUndefined();
  expect(manifest.content_security_policy.extension_pages).not.toContain(
    "'unsafe-eval'",
  );
  writeFileSync(
    "audit/reports/manifest-controls.json",
    JSON.stringify(
      {
        status: "PASS",
        permissions: manifest.permissions,
        hosts: manifest.host_permissions,
        contentMatches: manifest.content_scripts[0].matches,
        optionalPermissions: [],
        webAccessibleResources: [],
        externallyConnectable: [],
        scope:
          "Manifest assertions only; this is not a completed independent security scan.",
      },
      null,
      2,
    ) + "\n",
  );
});
it("renders hostile external opening and opponent strings as escaped text", () => {
  const hostile = "<img src=x onerror=alert(1)>",
    game = normalizeGame(
      {
        uuid: "hostile",
        end_time: Date.parse("2026-01-01T12:00:00Z") / 1000,
        time_class: "rapid",
        rules: "chess",
        white: { username: "auditplayer", result: "win", rating: 1000 },
        black: { username: hostile, result: "resigned", rating: 1100 },
        pgn: `[Opening "${hostile}"]`,
      },
      "auditplayer",
    )!;
  expect(aggregateOpenings([game])[0].name).toBe(hostile);
  expect(aggregateOpponents([game])[0].name).toBe(hostile);
  for (const element of [
    <OpeningsPage games={[game]} />,
    <OpponentsPage games={[game]} allGames={[game]} />,
    <OverviewPage games={[game]} allGames={[game]} filters={defaultFilters} />,
  ]) {
    const html = renderToStaticMarkup(element);
    expect(html).not.toContain(hostile);
    expect(html).not.toMatch(/<img[^>]+onerror/i);
  }
});
