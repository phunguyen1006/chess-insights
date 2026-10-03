import { IDBFactory } from "fake-indexeddb";
import { it, expect, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";
it("upgrades a populated v2 database without changing any game, archive, engine or review record", async () => {
  vi.resetModules();
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  const stores = [
    "games",
    "archives",
    "users",
    "analyticsCache",
    "moveTimeAnalysis",
    "engineAnalysis",
    "mistakes",
    "mistakeReviews",
    "analysisQueue",
  ];
  const old = await new Promise<IDBDatabase>((resolve) => {
    const req = factory.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      for (const name of stores) {
        const s = req.result.createObjectStore(name, {
          keyPath: name === "users" ? "username" : "id",
        });
        if (!["users", "analyticsCache"].includes(name))
          s.createIndex("username", "username");
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  const tx = old.transaction(stores, "readwrite");
  for (const name of stores)
    tx.objectStore(name).put({
      id: `${name}:preserved`,
      username: "alice",
      value: `original-${name}`,
    });
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
  });
  old.close();
  const { database, idbResult } = await import("../src/data/storage/database");
  const db = await database();
  expect(db.version).toBe(4);
  for (const name of stores)
    expect(
      await idbResult(
        db
          .transaction(name)
          .objectStore(name)
          .get(name === "users" ? "alice" : `${name}:preserved`),
      ),
    ).toMatchObject({ value: `original-${name}` });
  expect(db.objectStoreNames.contains("puzzleAttempts")).toBe(true);
  expect(db.objectStoreNames.contains("puzzleTrackingState")).toBe(true);
  db.close();
  vi.unstubAllGlobals();
});
