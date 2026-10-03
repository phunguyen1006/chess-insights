import { afterEach, expect, it, vi } from "vitest";
import { requestJson } from "../src/data/api/chessComApi";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("bounds 429 retry count and delay even with an excessive Retry-After", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(() =>
    Promise.resolve(
      new Response("", { status: 429, headers: { "Retry-After": "999999" } }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const pending = requestJson("auditplayer"),
    assertion = expect(pending).rejects.toMatchObject({ code: "429" });
  await vi.advanceTimersByTimeAsync(74999);
  expect(fetcher).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(1);
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});
it("releases the serial queue after 500 and DNS/network failure", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 500 }))
    .mockRejectedValueOnce(new TypeError("DNS failed"))
    .mockResolvedValueOnce(new Response('{"recovered":true}'));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestJson("auditplayer")).rejects.toMatchObject({
    code: "500",
  });
  await expect(requestJson("auditplayer")).rejects.toMatchObject({
    code: "NETWORK",
  });
  await expect(requestJson("auditplayer")).resolves.toEqual({
    recovered: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("passes a 20-second abort signal and no credentials to every request", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options: RequestInit) => {
      expect(options.credentials).toBe("omit");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return Promise.resolve(new Response("{}"));
    }),
  );
  await requestJson("auditplayer");
  expect(timeout).toHaveBeenCalledWith(20000);
});
