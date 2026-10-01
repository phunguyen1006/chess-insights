import { readFile, stat } from "node:fs/promises";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const sourceManifest = JSON.parse(
  await readFile("public/manifest.json", "utf8"),
);
if (
  [
    manifest.version,
    sourceManifest.version,
    lock.version,
    lock.packages?.[""]?.version,
  ].some((version) => version !== pkg.version)
)
  throw new Error(
    "Build, manifest, package and lockfile versions differ. Rebuild first.",
  );
if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required");
if (JSON.stringify(manifest.permissions) !== '["storage","offscreen"]')
  throw new Error("Unexpected permissions");
for (const path of [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((c) => [...c.js, ...c.css]),
  ...Object.values(manifest.icons),
  "engine-host.html",
  "engineHost.js",
  "vendor/stockfish/stockfish-18-lite-single.js",
  "vendor/stockfish/stockfish-18-lite-single.wasm",
  "vendor/stockfish/Copying.txt",
  "vendor/stockfish/source-18.0.8.zip",
  "vendor/stockfish/SOURCE.md",
  "vendor/react-LICENSE.txt",
  "vendor/react-dom-LICENSE.txt",
  "vendor/chess-js-LICENSE.txt",
])
  if (!(await stat(`dist/${path}`)).size)
    throw new Error(`Missing build file: ${path}`);
for (const [size, path] of Object.entries(manifest.icons)) {
  const bytes = await readFile(`dist/${path}`);
  if (
    bytes.readUInt32BE(16) !== Number(size) ||
    bytes.readUInt32BE(20) !== Number(size)
  )
    throw new Error(`Wrong icon size: ${path}`);
}
const content = await readFile("dist/content.js", "utf8");
if (
  process.argv.includes("--release") &&
  content.includes("__CHESS_INSIGHTS_DEBUG__")
)
  throw new Error(
    "Release packages require a production build, not build:debug.",
  );
if (
  content.includes("Local integration fixture") ||
  content.includes("chess-insights-fixture")
)
  throw new Error("Development fixture leaked into production");
const wasm = await readFile(
  "dist/vendor/stockfish/stockfish-18-lite-single.wasm",
);
if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])))
  throw new Error("Invalid local Stockfish WASM");
if (
  !manifest.content_security_policy?.extension_pages.includes(
    "'wasm-unsafe-eval'",
  )
)
  throw new Error("WASM CSP is missing");
const host = await readFile("dist/engine-host.html", "utf8");
if (host.includes("/src/") || host.includes("@vite"))
  throw new Error("Development engine host leaked into production");
for (const match of host.matchAll(/(?:src|href)="([^"]+\.js)"/g))
  await stat(`dist/${match[1].replace(/^\//, "")}`);
console.log(
  "Verified Manifest V3, storage/offscreen permissions, scripts/CSS/icons, isolated engine host, local WASM, GPL license/source and production fixture exclusion.",
);
