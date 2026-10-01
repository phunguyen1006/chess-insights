import { it, expect, vi, afterEach } from "vitest";
import { LocalEngine } from "../src/analysis/engine";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("waits for uciok then readyok before allowing evaluations", async () => {
  const commands: string[] = [];
  class WorkerMock {
    onmessage: ((e: { data: string }) => void) | null = null;
    postMessage(command: string) {
      commands.push(command);
      queueMicrotask(() =>
        this.onmessage?.({
          data:
            command === "uci"
              ? "uciok"
              : command === "isready"
                ? "readyok"
                : "info",
        }),
      );
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", WorkerMock);
  const engine = new LocalEngine(
    "chrome-extension://test/vendor/stockfish/stockfish-18-lite-single.js",
  );
  await engine.ready();
  expect(commands).toEqual(["uci", "setoption name Hash value 16", "isready"]);
  expect(engine.status).toMatchObject({
    workerCreated: true,
    wasmLoaded: true,
    uciOk: true,
    readyOk: true,
    error: null,
  });
  engine.stop();
});
it("reports a silent startup after 12 seconds instead of remaining initializing forever", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "Worker",
    class {
      postMessage() {}
      terminate() {}
    },
  );
  const engine = new LocalEngine("local.js");
  const assertion = expect(engine.ready()).rejects.toThrow("waiting for uciok");
  await vi.advanceTimersByTimeAsync(12000);
  await assertion;
  expect(engine.status.readyOk).toBe(false);
  engine.stop();
});
