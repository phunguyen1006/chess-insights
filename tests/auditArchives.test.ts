import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RawGame } from "../src/shared/types";
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
});
afterEach(async () => {
  (await (await import("../src/data/storage/database")).database()).close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const game = (username: string, i: number): RawGame => ({
  uuid: `archive-${i}`,
  end_time: Date.parse("2025-01-15T12:00:00Z") / 1000 + i,
  time_class: "rapid",
  rules: "chess",
  white: { username, result: "win" },
  black: { username: "other", result: "resigned" },
});
it.each([0, 1, 49, 50, 51, 1000, 5000])(
  "fetches the entire monthly array of %i games without page-size truncation",
  async (n) => {
    const { syncYears, snapshot } =
        await import("../src/data/sync/syncManager"),
      username = `audit-archive-${n}`;
    const games = Array.from({ length: n }, (_, i) => game(username, i)),
      fetcher = vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("archives")
                ? {
                    archives: [
                      `https://api.chess.com/pub/player/${username}/games/2025/01`,
                    ],
                  }
                : { games: n ? [...games, games[0]] : [] },
            ),
          ),
      );
    vi.stubGlobal("fetch", fetcher);
    await syncYears(username, [2025]);
    expect((await snapshot(username)).games).toHaveLength(n);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await syncYears(username, [2025]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
it("three concurrent tabs share one sync and retain account isolation", async () => {
  const { syncYears, snapshot } = await import("../src/data/sync/syncManager");
  const fetcher = vi.fn(async (url: string) => {
    const username = url.split("/player/")[1].split("/")[0];
    return new Response(
      JSON.stringify(
        url.endsWith("archives")
          ? {
              archives: [
                `https://api.chess.com/pub/player/${username}/games/2025/01`,
              ],
            }
          : { games: [game(username, 1)] },
      ),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  await Promise.all([
    syncYears("audit-tabs-a", [2025]),
    syncYears("audit-tabs-a", [2025]),
    syncYears("audit-tabs-a", [2025]),
    syncYears("audit-tabs-b", [2025]),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect((await snapshot("audit-tabs-a")).games.map((g) => g.username)).toEqual(
    ["audit-tabs-a"],
  );
  expect((await snapshot("audit-tabs-b")).games.map((g) => g.username)).toEqual(
    ["audit-tabs-b"],
  );
});
it("preserves the successfully cached month when another archive fails", async () => {
  const { syncYears, snapshot } = await import("../src/data/sync/syncManager"),
    username = "audit-partial";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("archives")
        ? new Response(
            JSON.stringify({
              archives: [
                `https://api.chess.com/pub/player/${username}/games/2025/01`,
                `https://api.chess.com/pub/player/${username}/games/2025/02`,
              ],
            }),
          )
        : url.endsWith("/02")
          ? new Response(JSON.stringify({ games: [game(username, 1)] }))
          : new Response("", { status: 500 }),
    ),
  );
  await expect(syncYears(username, [2025])).rejects.toMatchObject({
    code: "500",
  });
  expect((await snapshot(username)).games).toHaveLength(1);
});
