import { IDBFactory } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { DB_NAME } from "../src/shared/constants";

it("closes an abandoned blocked-upgrade connection when the old tab finally closes", async () => {
  vi.resetModules();
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const open = factory.open.bind(factory);
  let abandoned!: IDBOpenDBRequest;
  vi.spyOn(factory, "open").mockImplementation((name, version) => {
    abandoned = open(name, version);
    return abandoned;
  });
  const { database } = await import("../src/data/storage/database");
  await expect(database()).rejects.toThrow("Database upgrade blocked");
  old.close();
  await vi.waitFor(() => expect(abandoned.readyState).toBe("done"));
  // The rejected open has no consumer who could close it. It must not leave
  // another live connection behind after the user retries the upgrade.
  expect(() => abandoned.result.transaction("games")).toThrow();
  const retry = await database();
  expect(retry.version).toBe(4);
  expect(await database()).toBe(retry);
  retry.close();
  vi.unstubAllGlobals();
});
