import {
  getArchiveIndex,
  getMonthlyArchive,
  cleanUsername,
  ApiFailure,
} from "../api/chessComApi";
import {
  getUser,
  saveUser,
  getArchive,
  upsertArchive,
  getGames,
} from "../storage/gameRepository";
import { normalizeGame } from "../normalize/normalizeGame";
import {
  CURRENT_MONTH_TTL,
  INDEX_TTL,
  MANUAL_REFRESH_COOLDOWN,
} from "../../shared/constants";
import { timezone } from "../../shared/dates";
import type { Snapshot, UserRecord } from "../../shared/types";
const locks = new Map<string, Promise<void>>();
// PubAPI/CDN responses can lag by 24 hours, including just-closed archives.
const ARCHIVE_SETTLE_DELAY = 24 * 60 * 60_000;
export async function snapshot(username: string): Promise<Snapshot> {
  const [games, user] = await Promise.all([
    getGames(username),
    getUser(username),
  ]);
  const years = new Set([
    new Date().getFullYear(),
    ...games.map((g) => Number(g.localDate.slice(0, 4))),
    ...(user?.archives ?? []).map((url) => Number(url.split("/").at(-2))),
  ]);
  return {
    games: games.map((game) => ({ ...game, pgn: null })),
    years: [...years].filter(Number.isFinite).sort((a, b) => b - a),
    lastSync: user?.lastSync ?? 0,
    version: user?.version ?? 0,
  };
}
export function shouldRefreshArchive(
  lastFetchedAt: number | undefined,
  year: number,
  month: number,
  now = new Date(),
  force = false,
): boolean {
  if (!lastFetchedAt) return true;
  const current =
    now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
  const end = Date.UTC(year, month, 1);
  if (current)
    return force || now.getTime() - lastFetchedAt > CURRENT_MONTH_TTL;
  const stableAt = end + ARCHIVE_SETTLE_DELAY;
  if (lastFetchedAt >= stableAt) return false;
  // Refresh once after the cache window, even if an earlier post-rollover
  // response looked unchanged. During the window, avoid refetching on every tab.
  return (
    now.getTime() >= stableAt ||
    force ||
    now.getTime() - lastFetchedAt > INDEX_TTL
  );
}
async function sync(
  username: string,
  years: number[],
  force: boolean,
  onProgress?: () => void,
) {
  let user: UserRecord = (await getUser(username)) ?? {
    username,
    archives: [],
    indexFetchedAt: 0,
    lastSync: 0,
    version: 0,
  };
  if (force) {
    if (Date.now() - (user.lastManualRefresh ?? 0) < MANUAL_REFRESH_COOLDOWN)
      throw new ApiFailure(
        "COOLDOWN",
        "Please wait 30 seconds between manual refresh attempts.",
      );
    user = { ...user, lastManualRefresh: Date.now() };
    await saveUser(user);
  }
  if (force || Date.now() - user.indexFetchedAt > INDEX_TTL) {
    user = {
      ...user,
      archives: await getArchiveIndex(username),
      indexFetchedAt: Date.now(),
    };
    await saveUser(user);
  }
  const now = new Date();
  const months = user.archives
    .map((url) => {
      const match = url.match(/\/games\/(\d{4})\/(\d{2})$/);
      return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
    })
    .filter(
      (m): m is { year: number; month: number } =>
        !!m &&
        m.month >= 1 &&
        m.month <= 12 &&
        years.some(
          (y) =>
            m.year === y ||
            (m.year === y - 1 && m.month === 12) ||
            (m.year === y + 1 && m.month === 1),
        ),
    )
    .sort((a, b) => b.year - a.year || b.month - a.month);
  for (const { year, month } of months) {
    const id = `${username}:${year}:${month}`;
    const cached = await getArchive(id);
    if (!shouldRefreshArchive(cached?.lastFetchedAt, year, month, now, force))
      continue;
    const raw = await getMonthlyArchive(username, year, month);
    const normalized = raw
      .map((g) => normalizeGame(g, username))
      .filter((g): g is NonNullable<typeof g> => g !== null);
    const games = [...new Map(normalized.map((g) => [g.id, g])).values()];
    const bytes = new TextEncoder().encode(JSON.stringify(games));
    const fingerprint = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const changed = cached?.fingerprint !== fingerprint;
    user = {
      ...user,
      version: user.version + (changed ? 1 : 0),
      lastSync: Date.now(),
    };
    await upsertArchive(
      games,
      {
        id,
        username,
        year,
        month,
        lastFetchedAt: Date.now(),
        gameCount: games.length,
        syncStatus: "synced",
        timezone: timezone(),
        fingerprint,
      },
      user,
    );
    onProgress?.();
  }
  user = { ...user, lastSync: Date.now() };
  await saveUser(user);
}
export async function syncYears(
  account: string,
  years: number[],
  force = false,
  onProgress?: () => void,
) {
  const username = cleanUsername(account);
  const previous = locks.get(username);
  if (previous) {
    await previous.catch(() => undefined);
    return syncYears(username, years, force, onProgress);
  }
  const task = sync(username, years, force, onProgress);
  locks.set(username, task);
  try {
    await task;
  } finally {
    if (locks.get(username) === task) locks.delete(username);
  }
}
