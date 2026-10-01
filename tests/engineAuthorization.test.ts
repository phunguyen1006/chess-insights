import { it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("../src/data/storage/analysisRepository", () => ({
  analysisState: async () => ({ queue: { ids: ["completed-game"] } }),
}));
import {
  engineAuthorization,
  releaseEngine,
  isEngineActive,
} from "../src/background/engineAuthorization";
let url: string, active: boolean, data: Record<string, unknown>;
beforeEach(() => {
  url = "https://www.chess.com/home#chess-insights/mistakes";
  data = {};
  active = true;
  vi.stubGlobal("chrome", {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    tabs: { get: async () => ({ url, active }) },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: data[key] }),
        set: async (obj: Record<string, unknown>) => Object.assign(data, obj),
        remove: async (key: string) => {
          delete data[key];
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
const source = {
  url: "https://www.chess.com/home",
  tab: { id: 1 },
} as chrome.runtime.MessageSender;
const host = { url: "chrome-extension://test/engine-host.html#token" };
it("binds an engine to the registered tab even if iframe sender omits tab metadata", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  expect(
    await engineAuthorization(
      { type: "ci:engine-claim", token: opened.token },
      host,
    ),
  ).toBe("alice");
  expect(
    await engineAuthorization(
      { type: "ci:engine-guard", token: opened.token },
      host,
    ),
  ).toBe(true);
  expect(await isEngineActive("alice")).toBe(true);
  expect(await isEngineActive("bob")).toBe(false);
  url = "https://www.chess.com/game/live/123";
  await expect(
    engineAuthorization({ type: "ci:engine-guard", token: opened.token }, host),
  ).rejects.toThrow("restricted");
});
it("serializes claims, blocks second tabs, and revokes authorization on pause", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  const claims = await Promise.allSettled([
    engineAuthorization({ type: "ci:engine-claim", token: opened.token }, host),
    engineAuthorization({ type: "ci:engine-claim", token: opened.token }, host),
  ]);
  expect(claims.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(
    engineAuthorization({ type: "ci:engine-open", username: "bob" }, {
      ...source,
      tab: { id: 2 },
    } as chrome.runtime.MessageSender),
  ).rejects.toThrow("another");
  await releaseEngine("alice");
  expect(await isEngineActive("alice")).toBe(false);
  await expect(
    engineAuthorization({ type: "ci:engine-guard", token: opened.token }, host),
  ).rejects.toThrow("expired");
});
it("rejects a public page claiming an engine and rejects opening on a live route", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  await expect(
    engineAuthorization(
      { type: "ci:engine-claim", token: opened.token },
      source,
    ),
  ).rejects.toThrow("expired");
  url = "https://www.chess.com/play/online";
  await expect(
    engineAuthorization({ type: "ci:engine-open", username: "alice" }, source),
  ).rejects.toThrow("Historical");
});
it("releases a finished worker immediately so a second tab can analyze", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  await engineAuthorization(
    { type: "ci:engine-claim", token: opened.token },
    host,
  );
  expect(
    await engineAuthorization(
      { type: "ci:engine-release", token: opened.token },
      host,
    ),
  ).toBe(true);
  expect(
    await engineAuthorization({ type: "ci:engine-open", username: "bob" }, {
      ...source,
      tab: { id: 2 },
    } as chrome.runtime.MessageSender),
  ).toHaveProperty("token");
});
it("rejects duplicate starts from the owning tab without invalidating its token", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  await engineAuthorization(
    { type: "ci:engine-claim", token: opened.token },
    host,
  );
  await expect(
    engineAuthorization({ type: "ci:engine-open", username: "alice" }, source),
  ).rejects.toThrow("this Chess.com tab");
  expect(
    await engineAuthorization(
      { type: "ci:engine-guard", token: opened.token },
      host,
    ),
  ).toBe(true);
});
it("keeps a valid lease exclusive while an evaluation takes more than ten seconds", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  await engineAuthorization(
    { type: "ci:engine-claim", token: opened.token },
    host,
  );
  const stored = data["ci-engine-authorization"] as { heartbeat: number };
  stored.heartbeat -= 11000;
  await expect(
    engineAuthorization({ type: "ci:engine-open", username: "bob" }, {
      ...source,
      tab: { id: 2 },
    } as chrome.runtime.MessageSender),
  ).rejects.toThrow("another");
  expect(
    await engineAuthorization(
      { type: "ci:engine-guard", token: opened.token },
      host,
    ),
  ).toBe(true);
});
it("revokes analysis when its owning tab becomes hidden", async () => {
  const opened = (await engineAuthorization(
    { type: "ci:engine-open", username: "alice" },
    source,
  )) as { token: string };
  await engineAuthorization(
    { type: "ci:engine-claim", token: opened.token },
    host,
  );
  active = false;
  await expect(
    engineAuthorization({ type: "ci:engine-guard", token: opened.token }, host),
  ).rejects.toThrow("restricted");
  expect(await isEngineActive("alice")).toBe(false);
  await expect(
    engineAuthorization({ type: "ci:engine-open", username: "alice" }, source),
  ).rejects.toThrow("Historical");
});
