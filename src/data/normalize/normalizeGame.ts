import type { RawGame, NormalizedGame, TimeClass } from "../../shared/types";
import { fromUnixLocal, validCompletionTime } from "../../shared/dates";
import { normalizeResult, normalizeGameTermination } from "./normalizeResult";
import { normalizeOpening } from "./normalizeOpening";
export function normalizeGame(
  raw: RawGame,
  account: string,
): NormalizedGame | null {
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const username = account.toLowerCase(),
    white = raw.white ?? {},
    black = raw.black ?? {},
    whiteUsername = text(white.username),
    blackUsername = text(black.username);
  const playerColor =
    whiteUsername?.toLowerCase() === username
      ? "white"
      : blackUsername?.toLowerCase() === username
        ? "black"
        : null;
  if (
    !playerColor ||
    !validCompletionTime(raw.end_time) ||
    (raw.rules && raw.rules !== "chess")
  )
    return null;
  const player = playerColor === "white" ? white : black,
    opponent = playerColor === "white" ? black : white,
    playerResult = text(player.result) ?? "",
    opponentResult = text(opponent.result) ?? "",
    pgn = text(raw.pgn),
    timeControl = text(raw.time_control) ?? "",
    timeClass = text(raw.time_class),
    rawUrl = text(raw.url);
  const result = normalizeResult(playerResult, opponentResult);
  if (!result) return null;
  const identity =
    text(raw.uuid) ||
    rawUrl ||
    `${raw.end_time}:${whiteUsername?.toLowerCase()}:${blackUsername?.toLowerCase()}:${timeControl}`;
  const url =
    rawUrl && /^https:\/\/(www\.)?chess\.com\/game\//.test(rawUrl)
      ? rawUrl
      : "";
  const rating = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? n : null;
  return {
    id: `${username}:${identity}`,
    username,
    url,
    endTime: raw.end_time,
    localDate: fromUnixLocal(raw.end_time),
    timeClass: ["rapid", "blitz", "bullet", "daily"].includes(timeClass ?? "")
      ? (timeClass as TimeClass)
      : "unknown",
    timeControl,
    rated: raw.rated === true,
    rules: raw.rules ?? "chess",
    playerColor,
    result,
    rawPlayerResult: playerResult,
    rawOpponentResult: opponentResult,
    termination: normalizeGameTermination(playerResult, opponentResult),
    playerRating: rating(player.rating),
    opponentRating: rating(opponent.rating),
    opponentUsername: playerColor === "white" ? blackUsername : whiteUsername,
    whiteUsername,
    blackUsername,
    whiteRating: rating(white.rating),
    blackRating: rating(black.rating),
    pgn,
    ...normalizeOpening(pgn ?? "", text(raw.eco) ?? undefined),
  };
}
