"""Limited release hygiene checks; not an independent security scan.

Never print a matched credential. Reports contain only rule, file and line.
Run after build and release:pack from the repository root.
"""
import hashlib
import json
import re
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[2]
TEXT = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".txt",
        ".html", ".css", ".yml", ".yaml", ".py", ".toml"}
RULES = {
    "github-token": re.compile(r"\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}\b"),
    "aws-access-key": re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "google-api-key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"),
    "slack-token": re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{30,}\b"),
    "openai-key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b"),
}
TERMS = ["secret", "token", "password", "apikey", "api_key", "authorization",
         "cookie", "session", "bearer"]


def git(*args, input=None):
    return subprocess.run(
        ["git", "-c", f"safe.directory={ROOT.as_posix()}", *args],
        cwd=ROOT, input=input, capture_output=True, check=True
    ).stdout


def textual(name):
    p = Path(name)
    return p.suffix.lower() in TEXT or p.name in {"LICENSE", ".gitignore"}


def matches(text, name):
    return [{"file": name, "line": text.count("\n", 0, m.start()) + 1,
             "rule": rule}
            for rule, pattern in RULES.items() for m in pattern.finditer(text)]


def main():
    paths = sorted(set(git("ls-files", "-c", "-o", "--exclude-standard")
                       .decode("utf-8").splitlines()))
    working_hits, env_paths = [], []
    counts = dict.fromkeys(TERMS, 0)
    checked = 0
    for name in paths:
        p = ROOT / name
        if p.name == ".env" or p.name.startswith(".env."):
            env_paths.append(name)
        if not p.is_file() or not textual(name):
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        checked += 1
        working_hits.extend(matches(text, name))
        if name.startswith(("src/", "tests/", "public/", "scripts/")):
            for term in TERMS:
                counts[term] += len(re.findall(term, text, re.IGNORECASE))

    # Deduplicate blobs across every reachable commit before inspecting text.
    objects = {}
    for line in git("rev-list", "--objects", "--all").decode("utf-8").splitlines():
        sha, _, name = line.partition(" ")
        if name and textual(name):
            objects.setdefault(sha, name)
    query = "".join(sha + "\n" for sha in objects).encode()
    metadata = git("cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)",
                   input=query).decode().splitlines()
    history_hits, history_count = [], 0
    for line in metadata:
        sha, kind, size = line.split()
        if kind != "blob":
            continue
        data = git("cat-file", "blob", sha)
        if b"\0" in data:
            continue
        history_count += 1
        for hit in matches(data.decode("utf-8", errors="replace"), objects[sha]):
            history_hits.append({**hit, "blob": sha})

    version = json.loads((ROOT / "package.json").read_text())["version"]
    filename = f"chess-insights-v{version}.zip"
    artifact = ROOT / "releases" / filename
    forbidden, debug_hits, build_hits, inventory = [], [], [], []
    with zipfile.ZipFile(artifact) as archive:
        names = archive.namelist()
        for info in archive.infolist():
            name = info.filename
            p = PurePosixPath(name)
            inventory.append({"path": name, "bytes": info.file_size})
            if (p.is_absolute() or ".." in p.parts or "\\" in name or
                any(part in {".git", "node_modules", "audit", "screenshots", "temp"}
                    for part in p.parts) or p.name.startswith(".env") or
                p.suffix in {".log", ".map", ".tmp"}):
                forbidden.append(name)
            if textual(name):
                text = archive.read(info).decode("utf-8", errors="replace")
                build_hits.extend(matches(text, name))
                if p.suffix in {".js", ".html"}:
                    for marker in ["Local integration fixture", "chess-insights-fixture",
                                   "__CHESS_INSIGHTS_DEBUG__", "@vite/client"]:
                        if marker in text:
                            debug_hits.append({"file": name, "marker": marker})
        required = ["manifest.json", "content.js", "content.css", "background.js",
                    "engine-host.html", "engineHost.js", "LICENSE", "THIRD_PARTY_NOTICES.md",
                    "INSTALL.md", "vendor/stockfish/Copying.txt",
                    "vendor/stockfish/source-18.0.8.zip",
                    "vendor/stockfish/stockfish-18-lite-single.wasm"]
        missing = [name for name in required if name not in names]
        manifest = json.loads(archive.read("manifest.json"))
        source = json.loads((ROOT / "public/manifest.json").read_text())
        manifest_match = manifest == source
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    expected_sum = (ROOT / "releases/SHA256SUMS.txt").read_text().split()[0]
    ok = not (working_hits or history_hits or build_hits or env_paths or forbidden
              or debug_hits or missing) and manifest_match and digest == expected_sum
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PASS" if ok else "FAIL",
        "scope": "Strict credential-format and artifact checks, not exhaustive secret detection or an independent security scan.",
        "workingTree": {"textFilesChecked": checked, "credentialMatches": working_hits,
                        "envFiles": env_paths, "sensitiveTermOccurrences": counts},
        "gitHistory": {"uniqueTextBlobsChecked": history_count,
                       "credentialMatches": history_hits, "refs": "all reachable local refs"},
        "artifact": {"file": filename, "bytes": artifact.stat().st_size,
                     "sha256": digest, "checksumMatches": digest == expected_sum,
                     "sourceManifestMatches": manifest_match,
                     "credentialMatches": build_hits, "forbiddenPaths": forbidden,
                     "debugMarkers": debug_hits, "missingRequired": missing,
                     "inventory": inventory},
    }
    (ROOT / "audit/reports/hygiene.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "workingTextFiles": checked,
                      "historyTextBlobs": history_count, "artifactEntries": len(inventory),
                      "credentialMatches": len(working_hits) + len(history_hits) + len(build_hits),
                      "forbiddenPaths": len(forbidden), "sha256": digest}))
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
