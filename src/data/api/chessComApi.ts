import type { RawGame } from "../../shared/types";
export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function cleanUsername(value: string): string {
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(value))
    throw new ApiFailure(
      "INVALID_USERNAME",
      "Enter a valid Chess.com username.",
    );
  return value.toLowerCase();
}
let queue: Promise<unknown> = Promise.resolve();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function requestJson<T>(path: string): Promise<T> {
  const run = async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      let response: Response;
      try {
        response = await fetch(`https://api.chess.com/pub/player/${path}`, {
          credentials: "omit",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new ApiFailure(
          "NETWORK",
          "Unable to reach Chess.com. Showing cached data if available.",
        );
      }
      if (response.status === 429 && attempt < 3) {
        const retry = Number(response.headers.get("Retry-After"));
        await pause(
          Math.min(
            25_000,
            Math.max(
              1000 * 2 ** attempt,
              Number.isFinite(retry) ? retry * 1000 : 0,
            ),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new ApiFailure(
          String(response.status),
          response.status === 404
            ? "Chess.com player or archive not found."
            : response.status === 429
              ? "Chess.com is rate limiting requests. Try again later."
              : "Chess.com API is unavailable.",
        );
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiFailure(
          "INVALID_JSON",
          "Chess.com returned an invalid response.",
        );
      }
    }
    throw new ApiFailure("429", "Chess.com is rate limiting requests.");
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
export async function getPlayerProfile(username: string) {
  const profile = await requestJson<Record<string, unknown>>(
    cleanUsername(username),
  );
  if (typeof profile.username !== "string")
    throw new ApiFailure("INVALID_DATA", "Invalid player profile.");
  return profile;
}
export const getPlayerStats = (username: string) =>
  requestJson<Record<string, unknown>>(`${cleanUsername(username)}/stats`);
export async function getArchiveIndex(username: string) {
  const data = await requestJson<{ archives?: unknown }>(
    `${cleanUsername(username)}/games/archives`,
  );
  if (
    !Array.isArray(data.archives) ||
    !data.archives.every((x) => typeof x === "string")
  )
    throw new ApiFailure("INVALID_DATA", "Invalid archive index.");
  return data.archives as string[];
}
export async function getMonthlyArchive(
  username: string,
  year: number,
  month: number,
) {
  const data = await requestJson<{ games?: unknown }>(
    `${cleanUsername(username)}/games/${year}/${String(month).padStart(2, "0")}`,
  );
  if (!Array.isArray(data.games))
    throw new ApiFailure("INVALID_DATA", "Invalid monthly archive.");
  return data.games.filter((x) => x && typeof x === "object") as RawGame[];
}
