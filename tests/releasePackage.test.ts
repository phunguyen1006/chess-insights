import { afterEach, expect, it } from "vitest";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}ci-release-test-`))
      throw new Error("Unexpected release test cleanup path");
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ci-release-test-"));
  roots.push(root);
  const write = async (path: string, content: string | Uint8Array) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
  const version = manifest.version;
  await write("package.json", JSON.stringify({ version }));
  await write(
    "package-lock.json",
    JSON.stringify({ version, packages: { "": { version } } }),
  );
  await write("public/manifest.json", JSON.stringify(manifest));
  await write("dist/manifest.json", JSON.stringify(manifest));
  await mkdir(join(root, "scripts"), { recursive: true });
  for (const script of ["verify-build.mjs", "package-release.mjs"])
    await copyFile(`scripts/${script}`, join(root, "scripts", script));
  await write("dist/content.js", "/* production bundle */");
  await write("dist/content.css", "body {} ");
  await write("dist/background.js", 'import "./assets/shared.js";');
  await write("dist/engineHost.js", 'import "./assets/shared.js";');
  await write("dist/assets/shared.js", "export const ready = true;");
  await write(
    "dist/engine-host.html",
    '<script src="/engineHost.js"></script><link href="/assets/shared.js">',
  );
  for (const path of Object.values(manifest.icons) as string[]) {
    await mkdir(dirname(join(root, "dist", path)), { recursive: true });
    await copyFile(join("public", path), join(root, "dist", path));
  }
  for (const path of [
    "vendor/stockfish/stockfish-18-lite-single.js",
    "vendor/stockfish/Copying.txt",
    "vendor/stockfish/source-18.0.8.zip",
    "vendor/stockfish/SOURCE.md",
    "vendor/react-LICENSE.txt",
    "vendor/react-dom-LICENSE.txt",
    "vendor/chess-js-LICENSE.txt",
  ])
    await write(`dist/${path}`, "Release guard fixture");
  await write(
    "dist/vendor/stockfish/stockfish-18-lite-single.wasm",
    new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
  );
  await write("LICENSE", "Release guard fixture");
  await write("THIRD_PARTY_NOTICES.md", "Release guard fixture");
  await write("docs/INSTALL.md", "Release guard fixture");
  return { root, write, version };
}
function pack(root: string) {
  return spawnSync(process.execPath, ["scripts/package-release.mjs"], {
    cwd: root,
    encoding: "utf8",
    timeout: 45_000,
  });
}

it.each([
  "vendor/stockfish/stockfish-18-lite-single.wasm",
  "engineHost.js",
  "assets/shared.js",
])("refuses to publish a package missing runtime asset %s", async (asset) => {
  const { root } = await fixture();
  await rm(join(root, "dist", asset));
  const result = pack(root);
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`.replace(/\\+/g, "/")).toContain(
    asset,
  );
});
it("refuses an inconsistent source/lockfile/build version", async () => {
  const { root, write } = await fixture();
  await write(
    "package-lock.json",
    JSON.stringify({
      version: "0.0.0",
      packages: { "": { version: "0.0.0" } },
    }),
  );
  const result = pack(root);
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain("versions differ");
});
it("refuses a debug content bundle", async () => {
  const { root, write } = await fixture();
  await write("dist/content.js", "globalThis.__CHESS_INSIGHTS_DEBUG__ = true;");
  const result = pack(root);
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}${result.stderr}`).toContain("production build");
});
it("packages a verified build with matching SHA-256 and bundled installation/license files", async () => {
  const { root, version } = await fixture();
  const result = pack(root);
  expect(result.error).toBeUndefined();
  expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  const filename = `chess-insights-v${version}.zip`;
  const bytes = await readFile(join(root, "releases", filename));
  const digest = createHash("sha256").update(bytes).digest("hex");
  expect(await readFile(join(root, "releases/SHA256SUMS.txt"), "utf8")).toBe(
    `${digest}  ${filename}\n`,
  );
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "INSTALL.md"])
    expect(await readFile(join(root, "dist", file), "utf8")).toBe(
      "Release guard fixture",
    );
}, 50_000);
