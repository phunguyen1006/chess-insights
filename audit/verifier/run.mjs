import { execFileSync } from "node:child_process";
import process from "node:process";
import console from "node:console";
import { writeFileSync, mkdirSync } from "node:fs";
const root = process.cwd(),
  reports = "audit/reports";
mkdirSync(reports, { recursive: true });
const run = (file, args, env = {}) =>
  execFileSync(file, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024,
  });
let failed = false;
console.log(run("python", ["audit/verifier/independent.py", "--oracle-only"]));
for (const zone of ["UTC", "Asia/Bangkok", "Etc/GMT+5", "America/New_York"]) {
  const name = zone.replaceAll("/", "_");
  try {
    const log = run(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "tests/auditGolden.test.tsx",
        "--maxWorkers=1",
      ],
      { TZ: zone },
    );
    writeFileSync(`${reports}/golden-${name}.log`, log);
    console.log(`${zone}: PASS`);
  } catch (e) {
    failed = true;
    writeFileSync(
      `${reports}/golden-${name}.log`,
      String(e.stdout) + String(e.stderr),
    );
    console.log(`${zone}: FAIL`);
  }
}
try {
  console.log(run("python", ["audit/verifier/independent.py"]));
} catch (e) {
  failed = true;
  console.log(String(e.stdout));
}
process.exitCode = failed ? 1 : 0;
