import type { NormalizedGame } from "../shared/types";
import type { AnalysisState, ClockMove } from "./types";
import { timePressureThreshold, longThinkThreshold } from "./clocks";
export const mean = (a: number[]) =>
  a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
export function median(a: number[]) {
  if (!a.length) return null;
  const s = [...a].sort((a, b) => a - b),
    i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
export function timeAnalytics(games: NormalizedGame[], state: AnalysisState) {
  const map = new Map(state.clocks.map((c) => [c.id, c]));
  const real = games.filter((g) =>
    ["rapid", "blitz", "bullet"].includes(g.timeClass),
  );
  const records = real.flatMap((game) => {
    const clock = map.get(game.id);
    if (!clock?.supported) return [];
    const moves = clock.moves.filter((m) => m.color === game.playerColor),
      times = moves.flatMap((m) =>
        m.thinkSeconds === null ? [] : [m.thinkSeconds],
      );
    if (!times.length) return [];
    const pressure = moves.find(
      (m) =>
        m.remainingSeconds !== null &&
        m.remainingSeconds < timePressureThreshold(clock.baseSeconds),
    );
    return [
      {
        game,
        clock,
        moves,
        times,
        pressure,
        long: moves.filter(
          (m) =>
            m.thinkSeconds !== null &&
            m.thinkSeconds > longThinkThreshold(clock.baseSeconds),
        ),
      },
    ];
  });
  const times = records.flatMap((r) => r.times),
    pressure = records.filter((r) => r.pressure);
  const buckets = [
    ["<1", 0, 1],
    ["1–3", 1, 3],
    ["3–5", 3, 5],
    ["5–10", 5, 10],
    ["10–20", 10, 20],
    ["20–30", 20, 30],
    ["30+", 30, Infinity],
  ] as const;
  const distribution = buckets.map(([label, low, high]) => {
    const n = times.filter((t) => t >= low && t < high).length;
    return [
      label,
      n,
      `${times.length ? ((n / times.length) * 100).toFixed(1) : 0}% of timed moves`,
    ] as [string, number, string];
  });
  const byMove = (select: (m: ClockMove, base: number) => number | null) =>
    Array.from({ length: 61 }, (_, i) => {
      const vals = records.flatMap((r) =>
        r.moves
          .filter((m) =>
            i === 60 ? m.moveNumber > 60 : m.moveNumber === i + 1,
          )
          .flatMap((m) => {
            const n = select(m, r.clock.baseSeconds);
            return n === null ? [] : [n];
          }),
      );
      return {
        label: i === 60 ? "61+" : String(i + 1),
        value: mean(vals),
        detail: `${vals.length} move observations`,
      };
    });
  const timeoutLosses = real.filter(
    (g) => g.result === "loss" && g.termination === "Timeout",
  );
  return {
    real,
    records,
    times,
    pressure,
    distribution,
    timeoutLosses,
    coverage: real.length ? records.length / real.length : 0,
    average: mean(times),
    median: median(times),
    used: mean(
      records
        .filter((r) => r.times.length === r.moves.length)
        .map((r) => r.times.reduce((s, n) => s + n, 0)),
    ),
    thinkCurve: byMove((m) => m.thinkSeconds),
    clockCurve: byMove((m, base) =>
      m.remainingSeconds === null ? null : (m.remainingSeconds / base) * 100,
    ),
  };
}
