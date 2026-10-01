import { useState } from "react";
import type { DataState } from "../../state/useData";
export function Setup({
  state,
  detected,
  onConnected,
}: {
  state: DataState;
  detected: string | null;
  onConnected?: () => void;
}) {
  const [input, setInput] = useState(detected ?? ""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="ci-setup"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void state
          .connect(input)
          .then((success) => {
            if (success) onConnected?.();
          })
          .finally(() => setBusy(false));
      }}
    >
      <p>
        Connect your public Chess.com history. All analytics stay on this
        device.
      </p>
      <label>
        Chess.com username{" "}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
          autoComplete="off"
          pattern="[a-zA-Z0-9_-]{2,30}"
        />
      </label>
      <button className="ci-primary" disabled={busy}>
        {busy ? "Connecting…" : "Connect"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
