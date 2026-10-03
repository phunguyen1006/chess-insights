import type { Color } from "../shared/types";
export type Phase = "opening" | "middlegame" | "endgame";
export interface ClockMove {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  remainingSeconds: number | null;
  thinkSeconds: number | null;
  phase: Phase;
}
export interface ClockAnalysis {
  id: string;
  username: string;
  parserVersion: number;
  source: string;
  supported: boolean;
  baseSeconds: number;
  incrementSeconds: number;
  moves: ClockMove[];
}
export interface Evaluation {
  type: "cp" | "mate";
  value: number;
  terminal?: boolean;
}
export interface Mistake {
  id: string;
  username: string;
  gameId: string;
  ply: number;
  moveNumber: number;
  playerColor: Color;
  fenBefore: string;
  playedMoveUci: string;
  playedMoveSan: string;
  bestMoveUci: string;
  bestMoveSan: string;
  evalBest: Evaluation;
  evalPlayed: Evaluation;
  centipawnLoss: number | null;
  mateTransition: string | null;
  severity: "inaccuracy" | "mistake" | "blunder";
  phase: Phase;
  opening: string | null;
  createdAt: number;
  bestLine: string[];
  thinkSeconds: number | null;
  inPressure: boolean | null;
}
export interface EngineAnalysis {
  id: string;
  username: string;
  analysisVersion: number;
  engineVersion: string;
  nodes: number;
  analyzedAt: number;
  source: string;
}
export type Grade = "Again" | "Hard" | "Good" | "Easy";
export interface Review {
  id: string;
  username: string;
  lastReviewedAt: number;
  nextReviewAt: number;
  reviewCount: number;
  successes: number;
  mastered: boolean;
  history: { at: number; grade: Grade; correct: boolean }[];
}
export interface Queue {
  engineRunToken?: string;
  engine?: EngineStatus;
  selected?: number;
  withPgn?: number;
  parseable?: number;
  skipped?: number;
  currentGame?: string;
  reanalyze?: boolean;
  id: string;
  username: string;
  ids: string[];
  completed: number;
  total: number;
  status: "paused" | "initializing" | "running" | "idle" | "error";
  error?: string;
}
export interface EngineStatus {
  workerCreated: boolean;
  wasmLoaded: boolean;
  uciOk: boolean;
  readyOk: boolean;
  running: boolean;
  error: string | null;
}
export interface AnalysisState {
  selection?: {
    total: number;
    analyzed: number;
    pending: number;
    skipped: number;
  };
  clocks: ClockAnalysis[];
  analyses: EngineAnalysis[];
  mistakes: Mistake[];
  reviews: Review[];
  queue: Queue | null;
}
