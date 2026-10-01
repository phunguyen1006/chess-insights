import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (pkg.version !== manifest.version)
  throw new Error("Build and package versions differ. Rebuild first.");
const content = await readFile("dist/content.js", "utf8");
if (content.includes("__CHESS_INSIGHTS_DEBUG__"))
  throw new Error(
    "Release packages require a production build, not build:debug.",
  );
for (const file of [
  "content.js",
  "content.css",
  "background.js",
  "vendor/react-LICENSE.txt",
  "vendor/react-dom-LICENSE.txt",
  "vendor/chess-js-LICENSE.txt",
  "vendor/stockfish/Copying.txt",
  "vendor/stockfish/source-18.0.8.zip",
]) {
  if (!(await stat(`dist/${file}`)).size)
    throw new Error(`Missing release file ${file}`);
}
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
  await copyFile(file, `dist/${file}`);
await copyFile("docs/INSTALL.md", "dist/INSTALL.md");
await mkdir("releases", { recursive: true });
const filename = `chess-insights-v${pkg.version}.zip`,
  destination = resolve("releases", filename);
await rm(destination, { force: true });
const zipped =
  process.platform === "win32"
    ? spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$buildRoot = (Resolve-Path -LiteralPath 'dist').Path
$archive = [IO.Compression.ZipFile]::Open($env:CI_RELEASE_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($assetPath in [IO.Directory]::EnumerateFiles($buildRoot, '*', [IO.SearchOption]::AllDirectories)) {
    $entryName = $assetPath.Substring($buildRoot.Length + 1).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $assetPath, $entryName, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }`,
        ],
        {
          env: { ...process.env, CI_RELEASE_ARCHIVE: destination },
          stdio: "inherit",
        },
      )
    : spawnSync("zip", ["-q", "-r", destination, "."], {
        cwd: "dist",
        stdio: "inherit",
      });
if (zipped.error || zipped.status !== 0)
  throw zipped.error ?? new Error("ZIP packaging failed");
const bytes = await readFile(destination),
  sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile("releases/SHA256SUMS.txt", `${sha256}  ${filename}\n`);
console.log(`Packaged ${filename} (${bytes.length} bytes), SHA-256 ${sha256}`);
