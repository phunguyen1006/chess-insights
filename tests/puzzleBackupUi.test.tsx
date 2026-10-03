// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PuzzleBackupSettings } from "../src/features/insights/components/PuzzleBackupSettings";
import { ActivityHeatmap } from "../src/features/heatmap/ActivityHeatmap";
import { ActivityPage } from "../src/features/insights/pages/ActivityPage";
import { localDate } from "../src/shared/dates";
import {
  MAX_PUZZLE_BACKUP_BYTES,
  type PuzzleBackup,
} from "../src/shared/puzzleBackup";
import { send } from "../src/features/state/client";
import { downloadText } from "../src/shared/download";

vi.mock("../src/features/state/client", () => ({ send: vi.fn() }));
vi.mock("../src/shared/download", () => ({ downloadText: vi.fn() }));
let container: HTMLDivElement;
let root: Root;
const onImported = vi.fn(async () => undefined);
const now = Date.now();
const attemptedAt = now - 30 * 86400_000;
const backup: PuzzleBackup = {
  format: "chess-insights-puzzles",
  schemaVersion: 1,
  extensionVersion: "0.1.7",
  exportedAt: now,
  username: "alice",
  tracking: {
    username: "alice",
    puzzleTrackingStartedAt: attemptedAt - 1000,
    puzzleTrackingStartedLocalDate: localDate(new Date(attemptedAt - 1000)),
    revision: 1,
  },
  attempts: [
    {
      id: "alice:42:session",
      username: "alice",
      puzzleId: "42",
      attemptedAt,
      localDate: localDate(new Date(attemptedAt)),
      result: "solved",
      ratingBefore: null,
      ratingAfter: null,
      ratingChange: null,
      puzzleRating: null,
      source: "live_tracker",
      createdAt: attemptedAt,
    },
  ],
};
const button = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent === text,
  )!;
async function choose(text: string, name = "backup.json", size?: number) {
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(file, "text", { value: vi.fn(async () => text) });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  const input =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  return file;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  vi.mocked(send).mockReset();
  vi.mocked(downloadText).mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <PuzzleBackupSettings
        key="alice"
        username="alice"
        onImported={onImported}
      />,
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("previews a validated account backup before merging, then reports added and kept records", async () => {
  await choose(JSON.stringify(backup));
  expect(
    container.querySelector('[aria-label="Puzzle backup preview"]')
      ?.textContent,
  ).toContain("1 attempts");
  expect(send).not.toHaveBeenCalled();
  vi.mocked(send).mockResolvedValue({
    username: "alice",
    imported: 1,
    skipped: 0,
    total: 1,
    tracking: backup.tracking,
  });
  await act(() => button("Merge puzzle history").click());
  expect(send).toHaveBeenCalledWith({
    type: "ci:puzzle-import",
    username: "alice",
    text: JSON.stringify(backup),
  });
  expect(onImported).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Added 1 attempts; kept 0 existing attempts",
  );
  expect(
    container.querySelector('[aria-label="Puzzle backup preview"]'),
  ).toBeNull();
});
it("clears a previous preview when a different account or damaged backup is chosen", async () => {
  await choose(JSON.stringify(backup));
  await choose(JSON.stringify({ ...backup, username: "bob" }));
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(button("Merge puzzle history")).toBeUndefined();
  await choose("{broken");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(send).not.toHaveBeenCalled();
});
it("rejects an oversized file before reading it and lets the user cancel a valid preview", async () => {
  const file = await choose("{}", "large.json", MAX_PUZZLE_BACKUP_BYTES + 1);
  expect(file.text).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "20 MB",
  );
  await choose(JSON.stringify(backup));
  await act(() => button("Cancel import").click());
  expect(button("Merge puzzle history")).toBeUndefined();
  expect(send).not.toHaveBeenCalled();
});
it("does not send duplicate merge requests and retains a retryable preview on failure", async () => {
  await choose(JSON.stringify(backup));
  let reject!: (reason: Error) => void;
  vi.mocked(send).mockReturnValue(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  await act(() => {
    button("Merge puzzle history").click();
    button("Merge puzzle history").click();
  });
  expect(send).toHaveBeenCalledOnce();
  expect(button("Merge puzzle history").disabled).toBe(true);
  await act(() => reject(new Error("Storage unavailable")));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Storage unavailable",
  );
  expect(button("Merge puzzle history").disabled).toBe(false);
});
it("downloads a validated JSON backup with a success status and reports download failures", async () => {
  vi.mocked(send).mockResolvedValue(backup);
  await act(() => button("Download puzzle backup").click());
  expect(downloadText).toHaveBeenCalledWith(
    expect.stringContaining("puzzles-alice-"),
    expect.any(String),
    "application/json;charset=utf-8",
  );
  expect(JSON.parse(vi.mocked(downloadText).mock.calls[0][1])).toMatchObject({
    username: "alice",
    attempts: backup.attempts,
  });
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "download started",
  );
  vi.mocked(downloadText).mockImplementation(() => {
    throw new Error("Download unavailable");
  });
  await act(() => button("Download puzzle backup").click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Download unavailable",
  );
});
it("ignores a pending export after switching accounts", async () => {
  let finish!: (value: PuzzleBackup) => void;
  vi.mocked(send).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(() => button("Download puzzle backup").click());
  await act(() =>
    root.render(
      <PuzzleBackupSettings key="bob" username="bob" onImported={onImported} />,
    ),
  );
  await act(() => finish(backup));
  expect(downloadText).not.toHaveBeenCalled();
  expect(container.textContent).toContain("bob");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("");
});
it("shows restored attempts before the live boundary while leaving empty older dates unknown", async () => {
  const attempt = backup.attempts[0];
  await act(() =>
    root.render(
      <ActivityHeatmap
        games={[]}
        attempts={[attempt]}
        mode="puzzles"
        year={new Date(attemptedAt).getFullYear()}
        trackingSince={localDate(new Date())}
        onDate={vi.fn()}
      />,
    ),
  );
  const restored = container.querySelector<HTMLButtonElement>(
    'button[aria-label*="1 puzzle attempts recorded"]',
  )!;
  expect(restored).not.toBeNull();
  expect(restored.classList.contains("ci-puzzle-unknown")).toBe(false);
  expect(
    container.querySelectorAll(".ci-puzzle-unknown").length,
  ).toBeGreaterThan(0);
  await act(() => restored.focus());
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
    "1 puzzles attempted",
  );
  expect(container.querySelector('[role="tooltip"]')?.textContent).toContain(
    "other attempts may be missing",
  );
  await act(() =>
    root.render(
      <ActivityPage
        games={[]}
        allGames={[]}
        attempts={[attempt]}
        mode="puzzles"
        years={[2026]}
        date={attempt.localDate}
        onYear={vi.fn()}
        trackingSince={localDate(new Date())}
      />,
    ),
  );
  expect(container.textContent).toContain("1 attempts · 1 solved · 0 failed");
  expect(container.textContent).toContain(
    "Restored records; other attempts may be missing.",
  );
});
