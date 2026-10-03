import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { normalizeOpening } from "../src/data/normalize/normalizeOpening";
import { normalizeGame } from "../src/data/normalize/normalizeGame";
import { aggregateOpenings } from "../src/analytics/openings";
const urls = [
  "Sicilian-Defense...5.O-O-Bg7-6.c3-Nf6",
  "Sicilian-Defense...6.O-O-e5-7.Nc3-Nge7",
];
const pgn = (slug: string) =>
  `[ECO "B50"]\n[ECOUrl "https://www.chess.com/openings/${slug}"]`;
it("keeps move suffixes out of the opening family for ellipsis URL slugs", () => {
  const names = urls.map((slug) => normalizeOpening(pgn(slug)).openingName);
  expect(names).toEqual(["Sicilian Defense", "Sicilian Defense"]);
  const games = urls.map((slug, i) =>
    normalizeGame(
      {
        uuid: `ellipsis-${i}`,
        end_time: Date.parse("2026-01-01T12:00:00Z") / 1000,
        time_class: "rapid",
        rules: "chess",
        white: { username: "alice", result: "win" },
        black: { username: "bob", result: "resigned" },
        pgn: pgn(slug),
      },
      "alice",
    )!,
  );
  expect(aggregateOpenings(games)).toHaveLength(1);
  expect(aggregateOpenings(games)[0].games).toBe(2);
});
it("repairs legacy cached opening metadata from its preserved PGN", async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  const { database, transactionDone } =
      await import("../src/data/storage/database"),
    { getGames } = await import("../src/data/storage/gameRepository");
  const game = normalizeGame(
    {
      uuid: "legacy-opening",
      end_time: Date.parse("2026-01-01T12:00:00Z") / 1000,
      rules: "chess",
      white: { username: "alice", result: "win" },
      black: { username: "bob", result: "resigned" },
      pgn: pgn(urls[0]),
    },
    "alice",
  )!;
  const db = await database(),
    tx = db.transaction("games", "readwrite"),
    done = transactionDone(tx);
  tx.objectStore("games").put({
    ...game,
    openingName: "Sicilian Defense...5.O O Bg7 6.c3 Nf6",
  });
  await done;
  try {
    expect((await getGames("alice"))[0].openingName).toBe("Sicilian Defense");
  } finally {
    db.close();
    vi.unstubAllGlobals();
  }
});
