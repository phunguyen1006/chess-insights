import type { Color } from "../shared/types";
import type { Evaluation, Grade, Review } from "./types";
export const MISTAKE_ANALYSIS_VERSION = 1;
export const ENGINE_VERSION = "Stockfish 18.0.8 lite single";
export const ENGINE_NODES = 20000;
export function userEvaluation(
  score: Evaluation,
  turn: "w" | "b",
  user: Color,
): Evaluation {
  if (score.type === "mate" && score.value === 0)
    return { type: "mate", value: turn === user[0] ? -1 : 1, terminal: true };
  return { ...score, value: score.value * (turn === user[0] ? 1 : -1) };
}
export function compareEvaluations(
  best: Evaluation,
  played: Evaluation,
  sameMove = false,
) {
  if (sameMove)
    return { centipawnLoss: 0, severity: null, mateTransition: null };
  if (best.type === "mate" || played.type === "mate") {
    const lostMate =
      best.type === "mate" &&
      best.value > 0 &&
      !(played.type === "mate" && played.value > 0);
    const allowedMate =
      played.type === "mate" &&
      played.value <= 0 &&
      !(best.type === "mate" && best.value <= 0);
    return {
      centipawnLoss: null,
      severity: lostMate || allowedMate ? ("blunder" as const) : null,
      mateTransition: lostMate
        ? "Lost a forced winning mate"
        : allowedMate
          ? "Allowed a forced mate"
          : null,
    };
  }
  const loss = Math.max(0, best.value - played.value);
  // Suppress ordinary CP swings when already at least eight pawns behind.
  const severity =
    best.value <= -800
      ? null
      : loss >= 200
        ? ("blunder" as const)
        : loss >= 100
          ? ("mistake" as const)
          : loss >= 50
            ? ("inaccuracy" as const)
            : null;
  return { centipawnLoss: loss, severity, mateTransition: null };
}
export function scheduleReview(
  id: string,
  username: string,
  grade: Grade,
  correct: boolean,
  previous?: Review,
  now = Date.now(),
): Review {
  const days = { Again: 1, Hard: 3, Good: 7, Easy: 21 }[grade];
  const successes =
    grade === "Again" || !correct ? 0 : (previous?.successes ?? 0) + 1;
  return {
    id,
    username,
    lastReviewedAt: now,
    nextReviewAt: now + days * 86400000,
    reviewCount: (previous?.reviewCount ?? 0) + 1,
    successes,
    mastered: successes >= 3 && days >= 21,
    history: [...(previous?.history ?? []), { at: now, grade, correct }],
  };
}
