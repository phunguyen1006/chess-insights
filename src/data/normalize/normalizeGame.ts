import type { RawGame, NormalizedGame, TimeClass } from "../../shared/types";
import { fromUnixLocal } from "../../shared/dates";
import { normalizeResult, normalizeGameTermination } from "./normalizeResult";
import { normalizeOpening } from "./normalizeOpening";
export function normalizeGame(
  raw: RawGame,
  account: string,
): NormalizedGame | null {
  const username = account.toLowerCase(),
    white = raw.white ?? {},
    black = raw.black ?? {};
  const playerColor =
    white.username?.toLowerCase() === username
      ? "white"
      : black.username?.toLowerCase() === username
        ? "black"
        : null;
  if (
    !playerColor ||
    !Number.isFinite(raw.end_time) ||
    !raw.end_time ||
    (raw.rules && raw.rules !== "chess")
  )
    return null;
  const player = playerColor === "white" ? white : black,
    opponent = playerColor === "white" ? black : white;
  const result = normalizeResult(player.result ?? "", opponent.result ?? "");
  if (!result) return null;
  const identity =
    raw.uuid ??
    raw.url ??
    `${raw.end_time}:${white.username?.toLowerCase()}:${black.username?.toLowerCase()}:${raw.time_control ?? ""}`;
  const url =
    raw.url && /^https:\/\/(www\.)?chess\.com\/game\//.test(raw.url)
      ? raw.url
      : "";
  const rating = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? n : null;
  return {
    id: `${username}:${identity}`,
    username,
    url,
    endTime: raw.end_time,
    localDate: fromUnixLocal(raw.end_time),
    timeClass: ["rapid", "blitz", "bullet", "daily"].includes(
      raw.time_class ?? "",
    )
      ? (raw.time_class as TimeClass)
      : "unknown",
    timeControl: raw.time_control ?? "",
    rated: raw.rated === true,
    rules: raw.rules ?? "chess",
    playerColor,
    result,
    rawPlayerResult: player.result ?? "",
    rawOpponentResult: opponent.result ?? "",
    termination: normalizeGameTermination(
      player.result ?? "",
      opponent.result ?? "",
    ),
    playerRating: rating(player.rating),
    opponentRating: rating(opponent.rating),
    opponentUsername: opponent.username ?? null,
    whiteUsername: white.username ?? null,
    blackUsername: black.username ?? null,
    whiteRating: rating(white.rating),
    blackRating: rating(black.rating),
    pgn: raw.pgn ?? null,
    ...normalizeOpening(raw.pgn ?? "", raw.eco),
  };
}
