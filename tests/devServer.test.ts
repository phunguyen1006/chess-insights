import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

let server: ViteDevServer;
let origin: string;
beforeAll(async () => {
  server = await createServer({
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string")
    throw new Error("Vite dev server did not start on a dynamic port");
  origin = `http://127.0.0.1:${address.port}`;
}, 30_000);
afterAll(async () => {
  await server?.close();
});

it("serves the layout report and content entry through Vite's actual DEV transform", async () => {
  for (const path of [
    "/src/content/dom/layoutReport.ts",
    "/src/content/chessComContent.tsx",
    "/package.json?import",
  ]) {
    const response = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    expect(response.status, `${path}: ${body}`).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(body).not.toContain("Cannot import non-asset file");
    expect(body).not.toContain('from "/public/manifest.json"');
  }
}, 30_000);

it("observes source additions while ignoring generated release ZIPs", async () => {
  await vi.waitFor(
    () => {
      expect(
        Object.keys(server.watcher.getWatched()).some((directory) =>
          directory.replace(/\\/g, "/").endsWith("/src/dev"),
        ),
      ).toBe(true);
    },
    { timeout: 10_000 },
  );
  const token = randomUUID();
  const source = resolve(`src/dev/ci-watch-probe-${token}.txt`);
  const release = resolve(`releases/ci-watch-probe-${token}.zip`);
  const observed = new Set<string>();
  const onAdd = (path: string) => observed.add(resolve(path));
  server.watcher.on("add", onAdd);
  try {
    await mkdir("releases", { recursive: true });
    await writeFile(release, "generated release watcher probe");
    await writeFile(source, "source watcher positive control");
    await vi.waitFor(() => expect(observed.has(source)).toBe(true), {
      timeout: 10_000,
    });
    // Allow the same filesystem event batch to settle after the source event.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(observed.has(release)).toBe(false);
    const watched = server.watcher.getWatched();
    expect(watched[resolve("releases")] ?? []).not.toContain(
      `ci-watch-probe-${token}.zip`,
    );
  } finally {
    server.watcher.off("add", onAdd);
    await Promise.all([
      rm(source, { force: true }),
      rm(release, { force: true }),
    ]);
  }
}, 30_000);
