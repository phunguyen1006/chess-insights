import { Chess } from "chess.js";
import type { Evaluation, Mistake, EngineStatus } from "./types";
import type { NormalizedGame } from "../shared/types";
import {
  parsePgnClockData,
  phaseFor,
  completedPgn,
  timePressureThreshold,
} from "./clocks";
import {
  compareEvaluations,
  userEvaluation,
  ENGINE_NODES,
  MISTAKE_ANALYSIS_VERSION,
} from "./evaluation";
export class LocalEngine {
  readonly status: EngineStatus = {
    workerCreated: false,
    wasmLoaded: false,
    uciOk: false,
    readyOk: false,
    running: false,
    error: null,
  };
  private worker: Worker;
  private receive: ((line: string) => void) | null = null;
  private reject: ((error: Error) => void) | null = null;
  constructor(url: string) {
    this.worker = new Worker(url);
    this.status.workerCreated = true;
    if (import.meta.env.DEV)
      console.debug("[Chess Insights] Worker created", url);
    this.worker.onmessage = (e) => this.receive?.(String(e.data));
    this.worker.onerror = (e) => {
      this.status.error = `Stockfish failed to load: ${e.message || url}`;
      this.reject?.(new Error(this.status.error));
    };
  }
  private command(
    command: string,
    until: string,
    timeout = 60000,
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const lines: string[] = [],
        timer = setTimeout(() => {
          this.receive = null;
          this.reject = null;
          this.status.error = `Stockfish timed out waiting for ${until}.`;
          reject(new Error(this.status.error));
        }, timeout);
      this.reject = (e) => {
        clearTimeout(timer);
        reject(e);
      };
      this.receive = (line) => {
        lines.push(line);
        if (line.startsWith(until)) {
          clearTimeout(timer);
          this.receive = null;
          this.reject = null;
          resolve(lines);
        }
      };
      this.worker.postMessage(command);
    });
  }
  async ready(onStatus?: (status: EngineStatus) => Promise<void>) {
    const deadline = Date.now() + 12000;
    await this.command("uci", "uciok", 12000);
    this.status.uciOk = true;
    if (import.meta.env.DEV) console.debug("[Chess Insights] uciok");
    await onStatus?.({ ...this.status });
    this.worker.postMessage("setoption name Hash value 16");
    await this.command(
      "isready",
      "readyok",
      Math.max(1, deadline - Date.now()),
    );
    this.status.readyOk = true;
    this.status.wasmLoaded = true;
    if (import.meta.env.DEV) console.debug("[Chess Insights] readyok");
    await onStatus?.({ ...this.status });
  }
  async evaluate(fen: string) {
    const board = new Chess(fen);
    if (board.isCheckmate())
      return {
        score: { type: "mate", value: 0 } as Evaluation,
        best: "",
        pv: [] as string[],
      };
    if (board.isDraw())
      return {
        score: { type: "cp", value: 0 } as Evaluation,
        best: "",
        pv: [] as string[],
      };
    this.worker.postMessage(`position fen ${fen}`);
    const lines = await this.command(`go nodes ${ENGINE_NODES}`, "bestmove");
    const last = [...lines]
      .reverse()
      .find((l) => /score (cp|mate) -?\d+/.test(l));
    const match = last?.match(/score (cp|mate) (-?\d+)/);
    if (!match) {
      this.status.error = "Engine returned no evaluation.";
      throw new Error(this.status.error);
    }
    const best = lines.at(-1)!.split(" ")[1];
    const variations = [...lines]
      .reverse()
      .flatMap((line) =>
        line.includes(" pv ")
          ? [line.split(" pv ")[1].trim().split(/\s+/).slice(0, 5)]
          : [],
      );
    const pv =
      variations.find((p) => p[0] === best && p.length >= 3) ??
      variations.find((p) => p[0] === best) ??
      [];
    return {
      score: { type: match[1] as Evaluation["type"], value: Number(match[2]) },
      best,
      pv,
    };
  }
  newGame() {
    this.worker.postMessage("ucinewgame");
    this.worker.postMessage("setoption name Clear Hash");
  }
  stop() {
    this.worker.terminate();
    this.reject?.(new Error("Analysis stopped."));
    this.receive = null;
  }
}
export function storedGameReplay(game: NormalizedGame) {
  if (
    game.rules !== "chess" ||
    game.endTime <= 0 ||
    !game.url ||
    !game.pgn ||
    !completedPgn(game.pgn)
  )
    throw new Error(
      `Game ${game.id}: completed standard PGN and URL required.`,
    );
  const board = new Chess();
  try {
    board.loadPgn(game.pgn);
  } catch (error) {
    throw new Error(
      `Game ${game.id}, move ${Math.floor(board.history().length / 2) + 1}: PGN replay failed: ${String(error)}`,
    );
  }
  const header = board.getHeaders();
  const player = game.playerColor === "white" ? header.White : header.Black;
  if (player?.toLowerCase() !== game.username.toLowerCase())
    throw new Error(`Game ${game.id}: player not found in PGN.`);
  const moves = board.history({ verbose: true });
  return {
    gameId: game.id,
    moveCount: moves.length,
    userColor: game.playerColor,
    fenCount: moves.filter((m) => m.color === game.playerColor[0]).length,
    success: true,
  };
}
export const uciMove = (move: {
  from: string;
  to: string;
  promotion?: string;
}) => move.from + move.to + (move.promotion ?? "");
export function lineSan(fen: string, line: string[]) {
  const chess = new Chess(fen),
    result: string[] = [];
  for (const uci of line) {
    try {
      result.push(
        chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci[4],
        }).san,
      );
    } catch {
      break;
    }
  }
  return result;
}
export async function analyzeGame(
  game: NormalizedGame,
  engine: LocalEngine,
  guard: () => Promise<void>,
): Promise<Mistake[]> {
  if (!game.pgn || !completedPgn(game.pgn))
    throw new Error("Only completed stored PGNs can be analyzed.");
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  const clocks = parsePgnClockData(game.pgn, game.timeControl),
    moves = chess.history({ verbose: true }),
    output: Mistake[] = [];
  engine.newGame();
  for (const [i, move] of moves.entries()) {
    if (move.color !== game.playerColor[0]) continue;
    await guard();
    const before = await engine.evaluate(move.before),
      playedUci = uciMove(move),
      sameMove = before.best === playedUci;
    const after = sameMove ? null : await engine.evaluate(move.after);
    const evalBest = userEvaluation(before.score, move.color, game.playerColor),
      evalPlayed = after
        ? userEvaluation(
            after.score,
            move.color === "w" ? "b" : "w",
            game.playerColor,
          )
        : evalBest;
    const comparison = compareEvaluations(evalBest, evalPlayed, sameMove);
    if (!comparison.severity) continue;
    const clock = clocks.moves[i];
    const startClock =
      i >= 2 ? clocks.moves[i - 2]?.remainingSeconds : clocks.baseSeconds;
    output.push({
      id: `${game.id}:${i + 1}:v${MISTAKE_ANALYSIS_VERSION}`,
      username: game.username,
      gameId: game.id,
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      playerColor: game.playerColor,
      fenBefore: move.before,
      playedMoveUci: playedUci,
      playedMoveSan: move.san,
      bestMoveUci: before.best,
      bestMoveSan: lineSan(move.before, [before.best])[0] ?? before.best,
      evalBest,
      evalPlayed,
      ...comparison,
      severity: comparison.severity,
      phase: phaseFor(move.before, Math.floor(i / 2) + 1),
      opening: game.openingName,
      createdAt: Date.now(),
      bestLine: lineSan(move.before, before.pv),
      thinkSeconds: clock?.thinkSeconds ?? null,
      inPressure:
        startClock === null || startClock === undefined || !clocks.supported
          ? null
          : startClock < timePressureThreshold(clocks.baseSeconds),
    });
    await new Promise((r) => setTimeout(r, 0));
  }
  return output;
}
