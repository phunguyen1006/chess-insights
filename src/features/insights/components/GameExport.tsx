import { useEffect, useRef, useState } from "react";
import type { NormalizedGame } from "../../../shared/types";
import { gamesToCsv } from "../../../shared/gameCsv";
import { downloadText } from "../../../shared/download";

export function GameExport({
  username,
  games,
  loading,
}: {
  username: string;
  games: NormalizedGame[];
  loading: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const generation = useRef(0),
    pending = useRef(false),
    latest = useRef({ username, games, loading });
  latest.current = { username, games, loading };
  useEffect(() => {
    generation.current++;
    pending.current = false;
    setBusy(false);
    setError("");
    setStatus("");
    return () => {
      generation.current++;
    };
  }, [username, games, loading]);

  const exportGames = async () => {
    if (pending.current || loading || !games.length) return;
    pending.current = true;
    const gen = generation.current;
    const selected = [...games];
    setBusy(true);
    setError("");
    setStatus("");
    try {
      // Render busy feedback before preparing a potentially large history.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (
        gen !== generation.current ||
        latest.current.username !== username ||
        latest.current.games !== games ||
        latest.current.loading
      )
        return;
      const account = username.replace(/[^a-z0-9_-]/gi, "_") || "account";
      downloadText(
        `chess-insights-${account}-games-${new Date().toISOString().slice(0, 10)}.csv`,
        gamesToCsv(selected),
        "text/csv;charset=utf-8",
      );
      setStatus(
        `Download started for ${selected.length.toLocaleString()} ${selected.length === 1 ? "game" : "games"}.`,
      );
    } catch (e) {
      if (gen === generation.current)
        setError(
          `Could not export games. ${e instanceof Error ? e.message : "Please try again."}`,
        );
    } finally {
      if (gen === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <div className="ci-row" style={{ flexWrap: "wrap" }} aria-busy={busy}>
      <button
        type="button"
        disabled={loading || busy || !games.length}
        onClick={() => void exportGames()}
      >
        {busy ? "Preparing CSV…" : "Export games CSV"} (
        {games.length.toLocaleString()})
      </button>
      {error ? (
        <span className="ci-status" role="alert">
          {error}
        </span>
      ) : (
        <span className="ci-note" role="status" aria-live="polite">
          {busy
            ? "Preparing your download…"
            : loading
              ? "Available after sync."
              : status}
        </span>
      )}
    </div>
  );
}
