// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePlayTime } from "../src/features/state/usePlayTime";
import type { GameDurationRecord } from "../src/analysis/playTime";
import type { DurationProgress } from "../src/data/storage/durationRepository";
import type { Reply, Request } from "../src/shared/types";

let state: ReturnType<typeof usePlayTime>,
  root: ReturnType<typeof createRoot>,
  container: HTMLDivElement;
const pending: {
  message: Extract<Request, { type: "ci:durations" }>;
  resolve: (reply: Reply<GameDurationRecord[]>) => void;
}[] = [];
type ProgressMessage = {
  type: string;
  username: string;
  progress: DurationProgress;
};
const listeners = new Set<(message: ProgressMessage) => void>();
const record = (id: string, username = "alice"): GameDurationRecord => ({
  id,
  username,
  durationSeconds: 60,
  startTimestamp: 1,
  endTimestamp: 60001,
  parserVersion: 1,
  fingerprint: "test",
  source: "pgn_start_end",
  confidence: "exact",
});
function Probe({
  username = "alice",
  enabled = true,
  version = 1,
}: {
  username?: string;
  enabled?: boolean;
  version?: number;
}) {
  state = usePlayTime(username, version, enabled);
  return (
    <p>
      {state.records.length}:{String(state.loading)}:{state.error}
    </p>
  );
}
beforeEach(() => {
  pending.length = 0;
  listeners.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (message: Extract<Request, { type: "ci:durations" }>) =>
        new Promise<Reply<GameDurationRecord[]>>((resolve) =>
          pending.push({ message, resolve }),
        ),
      onMessage: {
        addListener: (listener: (message: ProgressMessage) => void) =>
          listeners.add(listener),
        removeListener: (listener: (message: ProgressMessage) => void) =>
          listeners.delete(listener),
      },
    },
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
const finish = async (index: number, records: GameDurationRecord[]) =>
  act(async () => pending[index].resolve({ ok: true, data: records }));
const progress = (username: string, processed: number, total: number) =>
  act(() => {
    for (const listener of listeners)
      listener({
        type: "ci:duration-progress",
        username,
        progress: {
          processed,
          total,
          withDuration: processed,
          pending: total - processed,
          done: processed === total,
        },
      });
  });
it("loads cached records without invoking any duration parser when analysis is disabled", async () => {
  await act(() => root.render(<Probe enabled={false} />));
  expect(pending.map((p) => p.message.action)).toEqual(["cache"]);
  await finish(0, [record("cached")]);
  expect(state.records).toHaveLength(1);
  expect(state.loading).toBe(false);
  expect(pending).toHaveLength(1);
});
it("renders cached results first and never lets a slow partial cache overwrite the final analysis", async () => {
  await act(() => root.render(<Probe />));
  await finish(0, [record("cached")]);
  expect(state.records).toHaveLength(1);
  expect(state.loading).toBe(true);
  expect(pending[1].message.action).toBe("analyze");
  await progress("alice", 5, 10);
  expect(pending[2].message.action).toBe("cache");
  await finish(1, [record("cached"), record("new")]);
  expect(state.records).toHaveLength(2);
  expect(state.loading).toBe(false);
  await finish(2, [record("cached")]);
  expect(state.records).toHaveLength(2);
  await progress("alice", 1, 10);
  expect(state.processed).toBe(2);
  expect(state.total).toBe(2);
  expect(pending).toHaveLength(3);
});
it("ignores old account analysis/cache/progress while showing the new account's records", async () => {
  await act(() => root.render(<Probe />));
  await finish(0, [record("alice-cache")]);
  await progress("alice", 5, 10);
  await act(() => root.render(<Probe username="bob" />));
  expect(state.records).toEqual([]);
  await finish(1, [record("old-analysis")]);
  await finish(2, [record("old-partial")]);
  await progress("alice", 9, 10);
  expect(state.records).toEqual([]);
  expect(state.processed).toBe(0);
  await finish(3, [record("bob-cache", "bob")]);
  expect(state.records[0].username).toBe("bob");
  await finish(4, [record("bob-final", "bob")]);
  expect(state.records[0].id).toBe("bob-final");
  expect(state.loading).toBe(false);
});
it("discards initial caches superseded by a newer response and keeps progress monotonic", async () => {
  await act(() => root.render(<Probe />));
  await progress("alice", 5, 10); // Another view's already-running job.
  await finish(1, [record("newer-cache")]);
  await finish(0, [record("older-cache")]);
  expect(state.records[0].id).toBe("newer-cache");
  await progress("alice", 3, 10);
  expect(state.processed).toBe(5);
  await finish(2, [record("final")]);
});
it("reports a failed cache read and restarts cleanly after the dataset version changes", async () => {
  await act(() => root.render(<Probe />));
  await act(async () =>
    pending[0].resolve({
      ok: false,
      error: { code: "STORAGE", message: "Local storage unavailable" },
    }),
  );
  expect(state.loading).toBe(false);
  expect(state.error).toBe("Local storage unavailable");
  expect(pending).toHaveLength(1);
  await act(() => root.render(<Probe version={2} />));
  expect(state.error).toBe("");
  await finish(1, []);
  await finish(2, [record("retry")]);
  expect(state.records[0].id).toBe("retry");
  expect(state.loading).toBe(false);
});
it("sends no requests without an account and removes listeners on unmount", async () => {
  await act(() => root.render(<Probe username="" />));
  expect(pending).toHaveLength(0);
  await act(() => root.render(<Probe />));
  expect(listeners.size).toBe(1);
  await act(() => root.render(<Probe username="" />));
  expect(listeners.size).toBe(0);
  await finish(0, [record("old")]);
  expect(state.records).toHaveLength(0);
});
