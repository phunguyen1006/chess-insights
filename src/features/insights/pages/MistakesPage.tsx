import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import type { Grade } from "../../../analysis/types";
import { useAnalysis } from "../../state/useAnalysis";
import { send } from "../../state/client";
import { liveContext } from "../../../analysis/safety";
import {
  Panel,
  Stats,
  Select,
  Bars,
  Empty,
  number,
} from "../components/Common";
import { Donut, Trend, Scatter } from "../components/Charts";
import { ReviewBoard } from "../components/ReviewBoard";
const fixtureRuntime = import.meta.env.DEV && location.hostname === "127.0.0.1";
export function MistakesPage({
  username,
  games,
}: {
  username: string;
  games: NormalizedGame[];
}) {
  const { state, error, request } = useAnalysis(username, games),
    [severity, setSeverity] = useState("all"),
    [phase, setPhase] = useState("all"),
    [reviewState, setReviewState] = useState("all"),
    [scope, setScope] = useState("20"),
    [specific, setSpecific] = useState(""),
    [selected, setSelected] = useState(""),
    [engineError, setEngineError] = useState(""),
    [bankLimit, setBankLimit] = useState(30),
    [starting, setStarting] = useState(false),
    [grading, setGrading] = useState(false),
    [reanalyze, setReanalyze] = useState(false),
    [reviewQueue, setReviewQueue] = useState<string[]>([]),
    [reviewIndex, setReviewIndex] = useState(0),
    [correctCount, setCorrectCount] = useState(0);
  const host = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement | null>(null),
    owned = useRef(false),
    active = useRef(false),
    generation = useRef(0),
    reviewSession = useRef(0),
    opening = useRef(false),
    savingReview = useRef(false);
  const stop = async () => {
    const wasOwned = owned.current;
    owned.current = false;
    frame.current?.remove();
    frame.current = null;
    if (!fixtureRuntime && wasOwned)
      await send({ type: "ci:engine-stop", username }).catch(() => undefined);
  };
  useEffect(() => {
    generation.current++;
    active.current = true;
    const poll = setInterval(() => {
      if (!document.hidden)
        void request("state")
          .then((s) => {
            if (
              !fixtureRuntime &&
              !owned.current &&
              ["running", "initializing"].includes(s.queue?.status ?? "")
            ) {
              void send<{ active: boolean }>({
                type: "ci:engine-status",
                username,
              })
                .then(({ active: running }) => {
                  if (!running && active.current)
                    void request("pause").catch(() => undefined);
                })
                .catch(() => undefined);
            }
            if (
              s.queue?.status === "idle" ||
              s.queue?.status === "error" ||
              (s.queue?.status === "paused" &&
                s.queue.engine &&
                !s.queue.engine.running)
            )
              stop();
          })
          .catch(() => undefined);
    }, 1000);
    const guard = setInterval(() => {
      if (liveContext()) {
        stop();
        void request("pause").catch(() => undefined);
      }
    }, 250);
    const pauseOwned = () => {
      if (frame.current || owned.current) {
        stop();
        void request("pause").catch(() => undefined);
      }
    };
    const visibility = () => {
      if (document.hidden) pauseOwned();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pauseOwned);
    return () => {
      generation.current++;
      active.current = false;
      clearInterval(poll);
      clearInterval(guard);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pauseOwned);
      pauseOwned();
    };
  }, [request]);
  const startEngine = async () => {
    if (opening.current) return;
    opening.current = true;
    const gen = generation.current;
    setStarting(true);
    try {
      if (
        document.hidden ||
        liveContext() ||
        !location.hash.startsWith("#chess-insights/mistakes")
      )
        throw new Error("Historical Mistakes page required.");
      setEngineError("");
      if (fixtureRuntime) await stop();
      const { token } = await send<{ token: string }>({
        type: "ci:engine-open",
        username,
      });
      if (
        gen !== generation.current ||
        !active.current ||
        document.hidden ||
        liveContext()
      ) {
        if (!fixtureRuntime) await send({ type: "ci:engine-stop", username });
        await request("pause");
        return;
      }
      owned.current = true;
      if (!fixtureRuntime) return;
      const iframe = document.createElement("iframe");
      iframe.hidden = true;
      iframe.title = "Local historical Stockfish worker";
      iframe.src = chrome.runtime.getURL(`engine-host.html#${token}`);
      frame.current = iframe;
      host.current?.append(iframe);
    } catch (e) {
      if (gen === generation.current && active.current)
        setEngineError(e instanceof Error ? e.message : String(e));
    } finally {
      opening.current = false;
      if (gen === generation.current && active.current) setStarting(false);
    }
  };
  const pauseAnalysis = async () => {
    setStarting(true);
    try {
      await request("pause");
    } catch {
      /* inline error */
    } finally {
      await stop();
      setStarting(false);
    }
  };
  const enqueue = async () => {
    if (starting) return;
    setStarting(true);
    const sorted = [...games].sort((a, b) => b.endTime - a.endTime);
    const chosen =
      scope === "game"
        ? sorted.filter((g) => g.id === (specific || sorted[0]?.id))
        : scope === "month"
          ? sorted.filter((g) =>
              g.localDate.startsWith(
                new Date().toLocaleDateString("sv").slice(0, 7),
              ),
            )
          : scope === "more"
            ? sorted
                .filter((g) => !state.analyses.some((a) => a.id === g.id))
                .slice(0, 20)
            : scope === "period"
              ? sorted
              : sorted.slice(0, Number(scope));
    try {
      const s = await request("enqueue", {
        ids: chosen.map((g) => g.id),
        force: reanalyze,
      });
      if (import.meta.env.DEV)
        console.debug("[Chess Insights] Analyze selection", s.queue);
      if (s.queue?.ids.length) await startEngine();
    } catch {
      /* inline error */
    } finally {
      setStarting(false);
    }
  };
  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const all = state.mistakes.filter((m) => gameMap.has(m.gameId)),
    reviews = new Map(state.reviews.map((r) => [r.id, r])),
    now = Date.now();
  const due = (id: string) =>
    !reviews.has(id) || reviews.get(id)!.nextReviewAt <= now;
  const filtered = all.filter(
    (m) =>
      (severity === "all" || m.severity === severity) &&
      (phase === "all" || m.phase === phase) &&
      (reviewState === "all" ||
        (reviewState === "due" && due(m.id)) ||
        (reviewState === "new" && !reviews.has(m.id)) ||
        (reviewState === "mastered" && reviews.get(m.id)?.mastered)),
  );
  const analyzed = state.analyses.filter((a) => gameMap.has(a.id)),
    coverage = `Analyzed games: ${analyzed.length} / ${games.length}`;
  const current = state.mistakes.find(
      (m) => m.id === selected && gameMap.has(m.gameId),
    ),
    timed = filtered.filter(
      (m) => m.thinkSeconds !== null && m.centipawnLoss !== null,
    ),
    pressureKnown = all.filter((m) => m.inPressure !== null),
    pressureMistakes = pressureKnown.filter((m) => m.inPressure);
  const months = [
    ...new Set(analyzed.map((a) => gameMap.get(a.id)!.localDate.slice(0, 7))),
  ].sort();
  const nextReview = async (grade: Grade, correct: boolean) => {
    if (!current || savingReview.current) return;
    const session = reviewSession.current;
    const gen = generation.current;
    savingReview.current = true;
    setGrading(true);
    try {
      await request("review", { mistakeId: current.id, grade, correct });
      if (
        session !== reviewSession.current ||
        gen !== generation.current ||
        !active.current
      )
        return;
      if (reviewQueue.length) {
        const next = reviewIndex + 1;
        setReviewIndex(next);
        setCorrectCount((n) => n + Number(correct));
        setSelected(reviewQueue[next] ?? "");
      } else setSelected("");
    } catch {
      /* inline error */
    } finally {
      savingReview.current = false;
      setGrading(false);
    }
  };
  return (
    <>
      <h2>Mistake Bank</h2>
      <p className="ci-muted">
        Review important mistakes from your completed games.
      </p>
      {!analyzed.length && (
        <div className="ci-panel ci-analysis-empty">
          <h3>No games analyzed yet.</h3>
          <p>
            Analyze completed games to find positions worth reviewing. Analysis
            happens locally on your device.
          </p>
          <p className="ci-muted">
            {number(games.length)} historical games available
          </p>
        </div>
      )}
      {!!analyzed.length && (
        <>
          <p>{coverage}. Engine statistics cover analyzed games only.</p>
          <Stats
            items={[
              ["Unreviewed", all.filter((m) => !reviews.has(m.id)).length],
              ["Due today", all.filter((m) => due(m.id)).length],
              ["Blunders", all.filter((m) => m.severity === "blunder").length],
              ["Mistakes", all.filter((m) => m.severity === "mistake").length],
              ["Analyzed games", `${analyzed.length} / ${games.length}`],
            ]}
          />
        </>
      )}
      {!!analyzed.length && !all.length && (
        <p role="status">
          {analyzed.length} games analyzed. No mistakes exceeded the current
          classification thresholds.
        </p>
      )}
      <div className="ci-filters">
        <Select
          label="Analyze scope"
          value={scope}
          options={[
            ["10", "Recent 10 games"],
            ["20", "Recent 20 games"],
            ["more", "Next 20 unanalyzed games"],
            ["month", "Current month"],
            ["period", "Selected period"],
            ["game", "Specific game"],
          ]}
          onChange={setScope}
        />
        {scope === "game" && (
          <Select
            label="Specific completed game"
            value={
              specific ||
              [...games].sort((a, b) => b.endTime - a.endTime)[0]?.id ||
              ""
            }
            options={[...games]
              .reverse()
              .map((g) => [g.id, `${g.localDate} · ${g.opponentUsername}`])}
            onChange={setSpecific}
          />
        )}
        <button
          className="ci-primary"
          onClick={() =>
            void (state.queue?.ids.length &&
            ["paused", "error"].includes(state.queue.status)
              ? startEngine()
              : enqueue())
          }
          disabled={
            starting ||
            (state.queue?.status === "paused" && state.queue.engine?.running) ||
            ["running", "initializing"].includes(state.queue?.status ?? "")
          }
        >
          {starting || state.queue?.status === "initializing"
            ? "Loading engine…"
            : state.queue?.status === "running"
              ? `Analyzing ${Math.min(state.queue.completed + 1, state.queue.total)} / ${state.queue.total}`
              : state.queue?.status === "paused" && state.queue.ids.length
                ? "Resume Analysis"
                : engineError || state.queue?.status === "error"
                  ? "Retry Analysis"
                  : state.queue?.status === "idle" && state.queue.total > 0
                    ? "Analysis Complete"
                    : `Analyze ${scope === "10" || scope === "20" ? `Recent ${scope} Games` : "selected games"}`}
        </button>
        <label className="ci-field">
          <span>Reanalyze cached games</span>
          <input
            type="checkbox"
            checked={reanalyze}
            onChange={(e) => setReanalyze(e.target.checked)}
          />
        </label>
        <button
          disabled={!filtered.some((m) => due(m.id))}
          onClick={() => {
            reviewSession.current++;
            const ids = filtered
              .filter((m) => due(m.id))
              .sort(
                (a, b) =>
                  (reviews.get(a.id)?.nextReviewAt ?? 0) -
                  (reviews.get(b.id)?.nextReviewAt ?? 0),
              )
              .map((m) => m.id);
            setReviewQueue(ids);
            setReviewIndex(0);
            setCorrectCount(0);
            setSelected(ids[0]);
          }}
        >
          Start Review
        </button>
      </div>
      <div ref={host} />
      {state.queue && (
        <p className="ci-status" role="status">
          {state.queue.status === "initializing"
            ? "Loading engine…"
            : state.queue.status === "running"
              ? "Analyzing completed games"
              : state.queue.status}{" "}
          · {state.queue.completed} / {state.queue.total} ·{" "}
          {state.queue.ids.length} pending{" "}
          {!!state.queue.skipped && (
            <span>
              · {state.queue.parseable} / {state.queue.selected} eligible ·{" "}
              {state.queue.skipped} skipped{" "}
            </span>
          )}
          <progress
            max={Math.max(1, state.queue.total)}
            value={state.queue.completed}
          />
          {state.queue.currentGame && (
            <span>
              Current: {state.queue.currentGame} · Mistakes found:{" "}
              {all.length}{" "}
            </span>
          )}
          {["running", "initializing"].includes(state.queue.status) ? (
            <button disabled={starting} onClick={() => void pauseAnalysis()}>
              Pause
            </button>
          ) : (
            state.queue.ids.length > 0 && (
              <button
                disabled={starting || state.queue.engine?.running}
                onClick={() => void startEngine()}
              >
                Resume
              </button>
            )
          )}
          {state.queue.ids.length > 0 && (
            <button
              onClick={() => {
                stop();
                void request("cancel").catch(() => undefined);
              }}
            >
              Cancel pending
            </button>
          )}
        </p>
      )}
      {(engineError || state.queue?.status === "error") && (
        <p className="ci-status">
          Mistake analysis unavailable. {engineError || state.queue?.error}{" "}
          {!!state.queue?.ids.length && (
            <button onClick={() => void startEngine()}>Retry Engine</button>
          )}
        </p>
      )}
      {error && <p className="ci-status">{error}</p>}
      <div className="ci-filters">
        <Select
          label="Severity"
          value={severity}
          options={["all", "blunder", "mistake", "inaccuracy"]}
          onChange={setSeverity}
        />
        <Select
          label="Phase"
          value={phase}
          options={["all", "opening", "middlegame", "endgame"]}
          onChange={setPhase}
        />
        <Select
          label="Review state"
          value={reviewState}
          options={["all", "due", "new", "mastered"]}
          onChange={setReviewState}
        />
      </div>
      {reviewQueue.length > 0 && (
        <p className="ci-status">
          {reviewIndex < reviewQueue.length
            ? `Review ${reviewIndex + 1} / ${reviewQueue.length}`
            : `${reviewQueue.length} reviewed · ${correctCount} correct first try · ${reviewQueue.length - correctCount} need more practice`}
        </p>
      )}
      {current && (
        <ReviewBoard
          onClose={() => {
            reviewSession.current++;
            setSelected("");
            setReviewQueue([]);
          }}
          key={`${reviewSession.current}:${current.id}`}
          mistake={current}
          game={gameMap.get(current.gameId)!}
          review={reviews.get(current.id)}
          saving={grading}
          onGrade={(grade, correct) => void nextReview(grade, correct)}
        />
      )}
      {!!analyzed.length && (
        <>
          <div className="ci-two-columns">
            <Panel title="Severity distribution">
              <p className="ci-note">{coverage}</p>
              <Donut
                unit="mistakes"
                palette={["#b77f77", "#c7a06a", "#c4b878"]}
                label="Chess Insights mistake severity"
                data={["blunder", "mistake", "inaccuracy"].map((label) => ({
                  label,
                  value: filtered.filter((m) => m.severity === label).length,
                }))}
              />
            </Panel>
            <Panel title="Mistakes by phase">
              <p className="ci-note">{coverage}</p>
              <Bars
                rows={["opening", "middlegame", "endgame"].map((p) => [
                  p,
                  filtered.filter((m) => m.phase === p).length,
                ])}
              />
            </Panel>
          </div>
          <Panel title="Mistakes by time control">
            <p className="ci-note">{coverage}</p>
            <div className="ci-severity-pools">
              {["rapid", "blitz", "bullet", "daily"].map((pool) => {
                const ms = filtered.filter(
                  (m) => gameMap.get(m.gameId)?.timeClass === pool,
                );
                return (
                  <div key={pool}>
                    <strong>{pool}</strong>
                    <div
                      className="ci-severity-stack"
                      role="img"
                      aria-label={`${pool}: ${ms.length} mistakes`}
                    >
                      {["blunder", "mistake", "inaccuracy"].map((s) => {
                        const n = ms.filter((m) => m.severity === s).length;
                        return n > 0 ? (
                          <span
                            key={s}
                            className={`ci-severity-${s}`}
                            style={{ flex: n }}
                            title={`${s}: ${n}`}
                          >
                            {n}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="ci-note">
              Red: blunder · Orange: mistake · Yellow: inaccuracy
            </p>
          </Panel>
          <Panel title="Mistakes per analyzed game">
            <p className="ci-note">{coverage}</p>
            <Trend
              label="Monthly mistakes per analyzed game"
              data={months.map((month) => {
                const n = analyzed.filter((a) =>
                  gameMap.get(a.id)!.localDate.startsWith(month),
                ).length;
                return {
                  label: month,
                  value:
                    filtered.filter((m) =>
                      gameMap.get(m.gameId)!.localDate.startsWith(month),
                    ).length / n,
                  detail: `${n} analyzed games`,
                };
              })}
            />
          </Panel>
          <Panel title="Think time vs centipawn loss">
            <p className="ci-note">{coverage}</p>
            {timed.length >= 5 ? (
              <Scatter
                label="Mistake think time and evaluation loss"
                xLabel="Think time (seconds)"
                yLabel="Centipawn loss"
                data={timed.map((m) => ({
                  label: `${gameMap.get(m.gameId)!.opponentUsername} · ${m.moveNumber}. ${m.playedMoveSan}`,
                  x: m.thinkSeconds!,
                  y: m.centipawnLoss!,
                  detail: m.severity,
                }))}
              />
            ) : (
              <Empty>
                At least 5 mistakes with valid timing and centipawn evaluations
                are needed. Mate transitions are excluded.
              </Empty>
            )}
          </Panel>
          <Panel title="Mistakes and time pressure">
            <p>
              {coverage}. {pressureMistakes.length} / {pressureKnown.length}{" "}
              clock-covered mistakes occurred in pressure;{" "}
              {pressureMistakes.filter((m) => m.severity === "blunder").length}{" "}
              blunders.{" "}
              {
                all.filter((m) => m.thinkSeconds !== null && m.thinkSeconds < 2)
                  .length
              }{" "}
              mistakes followed moves under 2s, out of{" "}
              {all.filter((m) => m.thinkSeconds !== null).length} with timing.
              Associations only.
            </p>
          </Panel>
          <Panel title="Mistakes">
            {!filtered.length ? (
              <Empty>
                {analyzed.length
                  ? !all.length
                    ? "No mistakes exceeded the current classification thresholds."
                    : "No mistakes match these filters."
                  : "Choose completed games and start local analysis."}
              </Empty>
            ) : (
              filtered.slice(0, bankLimit).map((m) => {
                const g = gameMap.get(m.gameId)!;
                return (
                  <article className="ci-mistake-card" key={m.id}>
                    <span
                      className={`ci-severity-badge ci-severity-${m.severity}`}
                    >
                      {m.severity}
                    </span>
                    <p>
                      {g.localDate} · {g.timeClass} · {m.playerColor} · vs{" "}
                      {g.opponentUsername}
                    </p>
                    <strong>
                      Move {m.moveNumber} · You played {m.playedMoveSan}
                    </strong>
                    <p>
                      {m.centipawnLoss === null
                        ? m.mateTransition
                        : `${number(m.centipawnLoss)} cp loss`}{" "}
                      · {m.phase} ·{" "}
                      {reviews.get(m.id)?.mastered
                        ? "Mastered"
                        : due(m.id)
                          ? "Due"
                          : "Scheduled"}
                    </p>
                    <button
                      onClick={() => {
                        reviewSession.current++;
                        setReviewQueue([]);
                        setSelected(m.id);
                      }}
                    >
                      Review Position
                    </button>{" "}
                    <a href={g.url} target="_blank" rel="noreferrer">
                      Open Game →
                    </a>
                  </article>
                );
              })
            )}
            {bankLimit < filtered.length && (
              <button onClick={() => setBankLimit((n) => n + 30)}>
                Show more
              </button>
            )}
          </Panel>
        </>
      )}
      <p className="ci-note">
        Chess Insights classification: inaccuracy 50–99cp, mistake 100–199cp,
        blunder ≥200cp; forced-mate transitions handled separately. Ordinary
        swings when already ≤−8 pawns are suppressed. Stockfish 18 lite, one
        worker, 20,000 nodes per position, 16MB hash. Fast local heuristic, not
        Chess.com Game Review. Again 1 day, Hard 3, Good 7, Easy 21; mastered
        after 3 consecutive correct non-Again reviews and an Easy interval. New
        positions are due immediately. Analysis pauses when this tab is hidden
        or you leave Mistakes.
      </p>
    </>
  );
}
