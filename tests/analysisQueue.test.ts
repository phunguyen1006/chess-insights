import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Queue } from "../src/analysis/types";
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => vi.unstubAllGlobals());
const queued: Queue = {
  id: "alice",
  username: "alice",
  ids: ["first", "second"],
  completed: 0,
  total: 2,
  status: "running",
  engineRunToken: "run-1",
};
it("keeps completed progress when pause races the worker's checkpoint", async () => {
  const { put, analysisRequest, analysisState, updateAnalysisQueue } =
    await import("../src/data/storage/analysisRepository");
  await put("analysisQueue", queued);
  await Promise.all([
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "pause",
    }),
    updateAnalysisQueue("alice", (current) => ({
      ...current,
      ids: current.ids.filter((id) => id !== "first"),
      completed: current.completed + 1,
    })),
  ]);
  expect((await analysisState("alice")).queue).toMatchObject({
    ids: ["second"],
    completed: 1,
    status: "paused",
  });
});
it("serializes worker checkpoints without restoring cancelled IDs", async () => {
  const { put, analysisRequest, analysisState, updateAnalysisQueue } =
    await import("../src/data/storage/analysisRepository");
  await put("analysisQueue", queued);
  await Promise.all([
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "cancel",
    }),
    updateAnalysisQueue("alice", (current) => ({
      ...current,
      ids: current.ids.filter((id) => id !== "first"),
      completed: current.completed + 1,
    })),
  ]);
  expect((await analysisState("alice")).queue).toMatchObject({
    ids: [],
    completed: 1,
    status: "idle",
  });
});
it("applies ownership checks inside the storage transaction", async () => {
  const { put, analysisState, updateAnalysisQueue } =
    await import("../src/data/storage/analysisRepository");
  await put("analysisQueue", queued);
  const replaced = updateAnalysisQueue("alice", (current) => ({
    ...current,
    engineRunToken: "run-2",
    ids: ["replacement"],
    status: "initializing",
  }));
  const stale = updateAnalysisQueue("alice", (current) =>
    current.engineRunToken === "run-1" ? { ...current, status: "error" } : null,
  );
  await replaced;
  expect(await stale).toBeNull();
  expect((await analysisState("alice")).queue).toMatchObject({
    engineRunToken: "run-2",
    ids: ["replacement"],
    status: "initializing",
  });
});
it("retains both review histories when separate pages grade the same mistake together", async () => {
  const { put, analysisRequest, analysisState } =
    await import("../src/data/storage/analysisRepository");
  await put("engineAnalysis", {
    id: "g",
    username: "alice",
    analysisVersion: 1,
    engineVersion: "test",
    nodes: 20000,
    analyzedAt: 1,
    source: "test",
  });
  await put("mistakes", { id: "g:1:v1", username: "alice", gameId: "g" });
  await Promise.all([
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "review",
      mistakeId: "g:1:v1",
      grade: "Good",
      correct: true,
    }),
    analysisRequest({
      type: "ci:analysis",
      username: "alice",
      action: "review",
      mistakeId: "g:1:v1",
      grade: "Easy",
      correct: true,
    }),
  ]);
  const review = (await analysisState("alice")).reviews[0];
  expect(review.reviewCount).toBe(2);
  expect(review.successes).toBe(2);
  expect(review.history.map((entry) => entry.grade)).toEqual(["Good", "Easy"]);
});
