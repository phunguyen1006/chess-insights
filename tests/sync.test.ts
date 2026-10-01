import "fake-indexeddb/auto";
import { afterEach, it, expect, vi } from "vitest";
import { syncYears, snapshot } from "../src/data/sync/syncManager";
import { getArchive } from "../src/data/storage/gameRepository";
afterEach(() => vi.unstubAllGlobals());
it("loads only selected-year archives, persists real data, and avoids redownloading on reload", async () => {
  const username = "sync-user",
    now = new Date(),
    year = now.getFullYear(),
    month = String(now.getMonth() + 1).padStart(2, "0");
  const archive = `https://api.chess.com/pub/player/${username}/games/${year}/${month}`;
  const raw = {
    uuid: "sync-game",
    end_time: Math.floor(now.getTime() / 1000) - 10,
    time_class: "rapid",
    rated: true,
    rules: "chess",
    white: { username, result: "win", rating: 1000 },
    black: { username: "opponent", result: "resigned", rating: 1050 },
    pgn: '[ECO "C50"]',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          archives: [
            `https://api.chess.com/pub/player/${username}/games/${year - 5}/01`,
            archive,
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ games: [raw, raw] })));
  vi.stubGlobal("fetch", fetcher);
  const progress = vi.fn();
  await syncYears(username, [year], false, progress);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(progress).toHaveBeenCalledOnce();
  expect((await snapshot(username)).games).toHaveLength(1);
  expect((await snapshot(username)).games[0].pgn).toBeNull();
  expect((await snapshot(username)).version).toBe(1);
  expect(
    await getArchive(`${username}:${year}:${now.getMonth() + 1}`),
  ).toMatchObject({ gameCount: 1, syncStatus: "synced" });
  await syncYears(username, [year]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ archives: [archive] })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({ games: [raw, raw] })));
  await syncYears(username, [year], true);
  expect((await snapshot(username)).version).toBe(1);
  const requests = fetcher.mock.calls.length;
  await expect(syncYears(username, [year], true)).rejects.toMatchObject({
    code: "COOLDOWN",
  });
  expect(fetcher).toHaveBeenCalledTimes(requests);
});
