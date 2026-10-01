import { Chess } from "chess.js";
import type { ClockMove, Phase } from "./types";
export const TIME_PARSER_VERSION = 1;
export function timeControl(value: string) {
  const match = value.match(/^(\d+)(?:\+(\d+))?$/);
  return match && Number(match[1]) > 0
    ? { baseSeconds: Number(match[1]), incrementSeconds: Number(match[2] ?? 0) }
    : null;
}
export function phaseFor(fen: string, moveNumber: number): Phase {
  if (moveNumber <= 10) return "opening";
  const board = fen.split(" ")[0],
    queens = (board.match(/[qQ]/g) ?? []).length,
    nonPawns = (board.match(/[nbrqNBRQ]/g) ?? []).length;
  return nonPawns <= 4 || (queens === 0 && nonPawns <= 8)
    ? "endgame"
    : "middlegame";
}
export const timePressureThreshold = (base: number) => Math.min(30, base * 0.1);
export const longThinkThreshold = (base: number) =>
  Math.max(3, Math.min(30, base / 20));
export function clockSeconds(comment: string): number | null {
  const match = comment.match(
    /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*\]/,
  );
  if (!match || Number(match[2]) >= 60 || Number(match[3]) >= 60) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
export function completedPgn(pgn: string) {
  const tag = pgn.match(/\[Result\s+"([^"]+)"\]/)?.[1];
  const tail = pgn
    .trim()
    .replace(/\{[^}]*\}\s*$/, "")
    .trim();
  return !!tag && ["1-0", "0-1", "1/2-1/2"].includes(tag) && tail.endsWith(tag);
}
export function parsePgnClockData(pgn: string, control: string) {
  const tc = timeControl(control);
  const output = {
    supported: false,
    baseSeconds: tc?.baseSeconds ?? 0,
    incrementSeconds: tc?.incrementSeconds ?? 0,
    moves: [] as ClockMove[],
  };
  if (!tc || !completedPgn(pgn)) return output;
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    const comments = new Map(
      chess.getComments().map((c) => [c.fen, c.comment]),
    );
    const previous: Record<string, number | null> = {
      w: tc.baseSeconds,
      b: tc.baseSeconds,
    };
    output.moves = chess.history({ verbose: true }).map((move, i) => {
      let remaining = clockSeconds(comments.get(move.after) ?? ""),
        think: number | null = null;
      if (
        remaining !== null &&
        (remaining < 0 ||
          remaining >
            tc.baseSeconds + tc.incrementSeconds * (Math.floor(i / 2) + 1) + 1)
      )
        remaining = null;
      const before = previous[move.color];
      if (remaining !== null && before !== null) {
        const delta = before + tc.incrementSeconds - remaining;
        if (delta >= -0.5 && delta <= before + tc.incrementSeconds + 0.5)
          think = Math.max(0, delta);
      }
      previous[move.color] = remaining; // Never attribute several missing moves to one move.
      return {
        ply: i + 1,
        moveNumber: Math.floor(i / 2) + 1,
        color: move.color === "w" ? ("white" as const) : ("black" as const),
        san: move.san,
        remainingSeconds: remaining,
        thinkSeconds: think,
        phase: phaseFor(move.before, Math.floor(i / 2) + 1),
      };
    });
    output.supported = output.moves.some((m) => m.thinkSeconds !== null);
  } catch {
    /* Unsupported or corrupt PGNs are coverage gaps, never fabricated timings. */
  }
  return output;
}
