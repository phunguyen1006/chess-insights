import type { Result } from "../../shared/types";
const draws = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);
const losses = new Set([
  "checkmated",
  "resigned",
  "timeout",
  "abandoned",
  "lose",
  "bughousepartnerlose",
]);
export function normalizeResult(
  player: string,
  opponent: string,
): Result | null {
  if (player === "win") return "win";
  if (draws.has(player)) return "draw";
  if (losses.has(player)) return "loss";
  if (opponent === "win") return "loss";
  return null;
}
export function normalizeGameTermination(
  player: string,
  opponent: string,
): string {
  const code = player === "win" ? opponent : player;
  const names: Record<string, string> = {
    checkmated: "Checkmate",
    resigned: "Resignation",
    timeout: "Timeout",
    abandoned: "Abandoned",
    stalemate: "Stalemate",
    repetition: "Repetition",
    insufficient: "Insufficient material",
    agreed: "Agreed draw",
    "50move": "50-move rule",
    timevsinsufficient: "Time vs insufficient material",
  };
  return names[code] ?? "Other";
}
