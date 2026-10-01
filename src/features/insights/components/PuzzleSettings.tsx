import { useState } from "react";
import type { usePuzzleData } from "../../state/usePuzzleData";
import { Panel } from "./Common";
export function PuzzleSettings({
  state,
}: {
  state: ReturnType<typeof usePuzzleData>;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await f();
      setConfirm(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Puzzle tracking settings">
      <label>
        <input
          type="checkbox"
          checked={state.enabled}
          disabled={busy}
          onChange={(e) => void action(() => state.toggle(e.target.checked))}
        />{" "}
        Track puzzle activity
      </label>
      <p className="ci-note">
        Locally track completed rated puzzle attempts. Turning this off
        preserves your saved history.
      </p>
      {confirm ? (
        <div role="alert">
          <p>
            Delete locally tracked puzzle history for this account? Game history
            and game analyses will be preserved. This cannot be undone.
          </p>
          <button disabled={busy} onClick={() => void action(state.clear)}>
            Confirm clear puzzle history
          </button>
          <button disabled={busy} onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button disabled={busy} onClick={() => setConfirm(true)}>
          Clear locally tracked puzzle history
        </button>
      )}
      {error && <p role="status">{error}</p>}
    </Panel>
  );
}
