import { useState, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import type {
  Mistake,
  Evaluation,
  Grade,
  Review,
} from "../../../analysis/types";
import type { NormalizedGame } from "../../../shared/types";
import { uciMove } from "../../../analysis/engine";
import { number } from "./Common";
const pieces: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};
const evaluation = (e: Evaluation) =>
  e.terminal
    ? `Checkmate (${e.value > 0 ? "win" : "loss"})`
    : e.type === "mate"
      ? `Mate ${e.value}`
      : `${e.value >= 0 ? "+" : ""}${(e.value / 100).toFixed(2)}`;
export function ReviewBoard({
  mistake: m,
  game,
  review,
  onGrade,
  onClose,
}: {
  mistake: Mistake;
  game: NormalizedGame;
  review?: Review;
  onGrade: (grade: Grade, correct: boolean) => void;
  onClose: () => void;
}) {
  const reviewRoot = useRef<HTMLElement>(null);
  useEffect(() => {
    reviewRoot.current?.scrollIntoView?.({ block: "start" });
  }, []);
  const [from, setFrom] = useState(""),
    [san, setSan] = useState(""),
    [answer, setAnswer] = useState<{ san: string; correct: boolean } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [continuation, setContinuation] = useState(false);
  const chess = new Chess(m.fenBefore),
    files = m.playerColor === "white" ? "abcdefgh" : "hgfedcba",
    ranks =
      m.playerColor === "white"
        ? [8, 7, 6, 5, 4, 3, 2, 1]
        : [1, 2, 3, 4, 5, 6, 7, 8];
  const submit = (
    move: string | { from: string; to: string; promotion?: string },
  ) => {
    if (answer) return;
    try {
      const legal = chess.move(move);
      setAnswer({ san: legal.san, correct: uciMove(legal) === m.bestMoveUci });
      setError("");
    } catch {
      setError("Enter or select a legal move.");
    }
    setFrom("");
  };
  return (
    <section className="ci-panel" ref={reviewRoot}>
      <div className="ci-row">
        <h3>Review position · Move {m.moveNumber}</h3>
        <button onClick={onClose}>Close review</button>
      </div>
      <div className="ci-review-layout">
        <div>
          <div
            className="ci-review-board"
            aria-label={`Historical position, ${m.playerColor} at bottom`}
          >
            {ranks.flatMap((rank) =>
              [...files].map((file) => {
                const square = `${file}${rank}` as Parameters<Chess["get"]>[0],
                  piece = chess.get(square);
                return (
                  <button
                    key={square}
                    type="button"
                    className={`ci-board-square ${(file.charCodeAt(0) - 97 + rank) % 2 ? "ci-board-light" : "ci-board-green"}${from === square ? " ci-board-selected" : ""}`}
                    disabled={!!answer}
                    aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}`}
                    onClick={() => {
                      if (from) submit({ from, to: square, promotion: "q" });
                      else if (piece?.color === m.playerColor[0])
                        setFrom(square);
                    }}
                  >
                    <span
                      className={
                        piece?.color === "w"
                          ? "ci-piece-white"
                          : "ci-piece-black"
                      }
                    >
                      {piece ? pieces[piece.color + piece.type] : ""}
                    </span>
                    <small>{square}</small>
                  </button>
                );
              }),
            )}
          </div>
          <p className="ci-note">
            {m.playerColor} to move. Click origin and destination (promotion
            defaults to queen), or enter SAN/UCI for another promotion.
          </p>
        </div>
        <div>
          <p>
            {game.localDate} · {game.timeClass} {game.timeControl} ·{" "}
            {game.result}
            <br />
            vs {game.opponentUsername}
            <br />
            {game.openingName ?? "Unclassified opening"} · {m.phase}
          </p>
          <p>
            <strong>Your move</strong>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(san))
                submit({
                  from: san.slice(0, 2),
                  to: san.slice(2, 4),
                  promotion: san[4],
                });
              else submit(san);
            }}
          >
            <input
              aria-label="Your move"
              placeholder="SAN, e.g. Nf3"
              value={san}
              disabled={!!answer}
              onChange={(e) => setSan(e.target.value)}
            />
            <button disabled={!!answer || !san}>Check move</button>
          </form>
          {error && <p role="alert">{error}</p>}
          {!answer && (
            <button
              onClick={() => setAnswer({ san: "Revealed", correct: false })}
            >
              Reveal answer
            </button>
          )}
          {answer && (
            <>
              <p role="status">
                <strong>
                  {answer.correct ? "Correct" : "Compare the moves"}
                </strong>{" "}
                · Your answer: {answer.san}
              </p>
              <p>
                In the game: {m.playedMoveSan}
                <br />
                Best: <strong>{m.bestMoveSan}</strong>
                <br />
                Evaluation: {evaluation(m.evalBest)} →{" "}
                {evaluation(m.evalPlayed)}
                <br />
                Loss:{" "}
                {m.centipawnLoss === null
                  ? m.mateTransition
                  : `${number(m.centipawnLoss)} cp`}
              </p>
              <button onClick={() => setContinuation(!continuation)}>
                Show continuation
              </button>
              {continuation && <p>{m.bestLine.join(" ")}</p>}
              <p>Schedule your next review</p>
              <div className="ci-review-grades">
                {(["Again", "Hard", "Good", "Easy"] as Grade[]).map((grade) => (
                  <button
                    key={grade}
                    onClick={() => onGrade(grade, answer.correct)}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </>
          )}
          <p>
            {review
              ? `${review.reviewCount} reviews · next ${new Date(review.nextReviewAt).toLocaleDateString()}${review.mastered ? " · Mastered" : ""}`
              : "New position"}
          </p>
          {review && (
            <details>
              <summary>Review history</summary>
              {review.history.map((h, i) => (
                <p key={i}>
                  {new Date(h.at).toLocaleString()} · {h.grade} ·{" "}
                  {h.correct ? "Correct" : "Practice"}
                </p>
              ))}
            </details>
          )}
          <a href={game.url} target="_blank" rel="noreferrer">
            Open original game →
          </a>
        </div>
      </div>
    </section>
  );
}
