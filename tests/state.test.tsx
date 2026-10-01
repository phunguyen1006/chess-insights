// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useData } from "../src/features/state/useData";
import type { DataState } from "../src/features/state/useData";
import type { Request, Reply, Snapshot } from "../src/shared/types";
let state: DataState,
  root: ReturnType<typeof createRoot>,
  container: HTMLDivElement;
const calls: Request[] = [];
const pending: {
  message: Extract<Request, { type: "ci:sync" }>;
  resolve: (reply: Reply<unknown>) => void;
}[] = [];
const cached = (username: string): Snapshot => ({
  games: [],
  years: [2026, 2025],
  lastSync: 1,
  version: username === "alice" ? 1 : 2,
});
function Probe() {
  state = useData();
  return (
    <p>
      {state.username}:{state.data.version}:
      {state.loading ? "syncing" : "ready"}
    </p>
  );
}
beforeEach(() => {
  calls.length = 0;
  pending.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (message: Request) => {
        calls.push(message);
        if (message.type === "ci:sync")
          return new Promise<Reply<unknown>>((resolve) =>
            pending.push({ message, resolve }),
          );
        return Promise.resolve({
          ok: true,
          data:
            message.type === "ci:settings"
              ? { username: "alice" }
              : message.type === "ci:connect"
                ? { username: message.username }
                : cached("username" in message ? message.username : "alice"),
        });
      },
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("displays cached data before background refresh finishes and queues a selected historical year", async () => {
  await act(() => root.render(<Probe />));
  expect(state.settingsLoaded).toBe(true);
  expect(state.data.version).toBe(1);
  expect(state.loading).toBe(true);
  expect(pending).toHaveLength(1);
  await act(() => state.refresh([2025]));
  expect(pending).toHaveLength(1);
  await act(async () =>
    pending[0].resolve({ ok: true, data: cached("alice") }),
  );
  expect(pending).toHaveLength(2);
  expect(pending[1].message.years).toEqual([2025]);
  await act(async () =>
    pending[1].resolve({ ok: true, data: { ...cached("alice"), version: 3 } }),
  );
  expect(state.data.version).toBe(3);
  expect(state.loading).toBe(false);
});
it("ignores stale sync replies after an account switch", async () => {
  await act(() => root.render(<Probe />));
  await act(() => state.connect("bob"));
  expect(state.username).toBe("bob");
  expect(state.data.version).toBe(2);
  await act(async () =>
    pending[0].resolve({ ok: true, data: { ...cached("alice"), version: 99 } }),
  );
  expect(state.username).toBe("bob");
  expect(state.data.version).toBe(2);
});
it("clears the previous loading state when the next account cache cannot be read", async () => {
  const original = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = ((message: Request) =>
    message.type === "ci:snapshot" && message.username === "bob"
      ? Promise.resolve({
          ok: false,
          error: { message: "Storage unavailable", code: "UNKNOWN" },
        })
      : original(message)) as typeof chrome.runtime.sendMessage;
  await act(() => root.render(<Probe />));
  expect(state.loading).toBe(true);
  await act(() => state.connect("bob"));
  expect(state.username).toBe("bob");
  expect(state.error).toContain("Storage unavailable");
  expect(state.loading).toBe(false);
  await act(async () =>
    pending[0].resolve({ ok: true, data: cached("alice") }),
  );
  expect(state.username).toBe("bob");
  expect(state.loading).toBe(false);
});
it("forces only the first year in a manual multi-year refresh", async () => {
  await act(() => root.render(<Probe />));
  await act(async () =>
    pending[0].resolve({ ok: true, data: cached("alice") }),
  );
  await act(() => {
    void state.refresh([2026, 2025], true);
  });
  expect(pending[1].message.force).toBe(true);
  await act(async () =>
    pending[1].resolve({ ok: true, data: cached("alice") }),
  );
  expect(pending[2].message.force).toBe(false);
  await act(async () =>
    pending[2].resolve({ ok: true, data: cached("alice") }),
  );
  expect(state.loading).toBe(false);
});
