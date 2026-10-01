import { afterEach, it, expect, vi } from "vitest";
import {
  requestJson,
  getArchiveIndex,
  getMonthlyArchive,
  getPlayerProfile,
  cleanUsername,
} from "../src/data/api/chessComApi";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("rejects invalid usernames before network access", () =>
  expect(() => cleanUsername("../../private")).toThrow(
    "valid Chess.com username",
  ));
it("rejects non-string usernames without coercing them into account names", () => {
  expect(() => cleanUsername(undefined as unknown as string)).toThrow(
    "valid Chess.com username",
  );
  expect(() => cleanUsername(null as unknown as string)).toThrow(
    "valid Chess.com username",
  );
});
it("reports 404, malformed JSON and network errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("not json"))
      .mockRejectedValueOnce(new Error("offline")),
  );
  await expect(requestJson("alice")).rejects.toMatchObject({ code: "404" });
  await expect(requestJson("alice")).rejects.toMatchObject({
    code: "INVALID_JSON",
  });
  await expect(requestJson("alice")).rejects.toMatchObject({ code: "NETWORK" });
});
it("validates archive response shape", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"archives":"bad"}')),
  );
  await expect(getArchiveIndex("alice")).rejects.toMatchObject({
    code: "INVALID_DATA",
  });
});
it("reports valid JSON null payloads as API data errors, not storage failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(new Response("null"))),
  );
  await expect(getPlayerProfile("alice")).rejects.toMatchObject({
    code: "INVALID_DATA",
  });
  await expect(getArchiveIndex("alice")).rejects.toMatchObject({
    code: "INVALID_DATA",
  });
  await expect(getMonthlyArchive("alice", 2026, 9)).rejects.toMatchObject({
    code: "INVALID_DATA",
  });
});
it("backs off on 429 and serializes requests", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 429 }))
    .mockResolvedValueOnce(new Response('{"ok":1}'))
    .mockResolvedValueOnce(new Response('{"ok":2}'));
  vi.stubGlobal("fetch", fetcher);
  const first = requestJson("alice"),
    second = requestJson("bob");
  await vi.advanceTimersByTimeAsync(999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await expect(first).resolves.toEqual({ ok: 1 });
  await expect(second).resolves.toEqual({ ok: 2 });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
