import type { Request, Reply, Snapshot, RawGame } from "../shared/types";
import { normalizeGame } from "../data/normalize/normalizeGame";
import { gameForSnapshot } from "../data/sync/syncManager";
import source from "./data/public-games.json";
import { analysisRequest } from "../data/storage/analysisRepository";
import { database, transactionDone } from "../data/storage/database";
import { LocalEngine, storedGameReplay } from "../analysis/engine";
import { installNavigationFixture } from "./navigationFixture";
import {
  puzzleSnapshot,
  startPuzzleTracking,
  savePuzzleAttempt,
  clearPuzzleHistory,
} from "../data/storage/puzzleRepository";
import { installPuzzleFixture } from "./puzzleFixture";
import {
  durationSnapshot,
  ensureGameDurations,
} from "../data/storage/durationRepository";
import {
  exportPuzzleBackup,
  importPuzzleBackup,
} from "../data/storage/puzzleBackupRepository";
if (!import.meta.env.DEV) throw new Error("Fixtures are development-only.");
if (new URLSearchParams(location.search).get("presentation") === "stats") {
  const referenceTheme = document.createElement("style");
  referenceTheme.textContent = `
    nav.fixture-sidebar { background:#fff;color:#262522; }
    nav.fixture-sidebar a { color:#5d5b57;font-size:12px;font-weight:400; }
    nav.fixture-sidebar a:hover,nav.fixture-sidebar .ci-sidebar-link[aria-current="page"] { background:#f1f1f1; }
    .fixture-notice,[aria-label="Puzzle development controls"] { display:none!important; }
    nav.fixture-sidebar .brand { color:#262522; }
  `;
  document.head.append(referenceTheme);
}
// Native structural contract from the user's authenticated layout report:
// full-width auto-placed hero, auto-placed left column, right column row 2/span 2.
if (new URLSearchParams(location.search).get("layout") === "reported-grid") {
  const main = document.querySelector<HTMLElement>("main")!;
  const hero = main.querySelector<HTMLElement>(".fixture-play")!;
  const row = main.querySelector<HTMLElement>(".fixture-row")!;
  const left = row.querySelector<HTMLElement>(".fixture-column")!;
  const puzzle = row.querySelector<HTMLElement>(".daily-puzzle")!;
  main.classList.add("home-layout");
  hero.classList.add("layout-hero");
  left.id = "home-main";
  left.classList.add("layout-column-one");
  left.append(main.querySelector(".fixture-history")!);
  const sidebar = document.createElement("div");
  sidebar.id = "home-sidebar-container";
  sidebar.className = "layout-column-two";
  sidebar.append(puzzle);
  const stats = document.createElement("section");
  stats.className = "fixture-native-panel fixture-player-stats";
  stats.innerHTML =
    "<h2>Player Stats</h2><p>Rapid</p><p>Blitz</p><p>Bullet</p><p>Daily</p>";
  sidebar.append(stats);
  row.replaceWith(left, sidebar);
  const styles = document.createElement("style");
  styles.textContent = `
    .home-layout.fixture-main { display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px 24px; }
    .home-layout > .layout-hero { grid-column:1 / -1;min-height:456px; }
    .home-layout > .layout-column-one { grid-column:1;display:block!important; }
    .home-layout > .layout-column-one .fixture-history { min-height:650px; }
    .home-layout > .layout-column-two { grid-area:2 / 2 / span 2; }
    .home-layout > .layout-column-two .fixture-player-stats { min-height:1100px;margin-top:16px; }
    @media(max-width:700px) { .home-layout.fixture-main { grid-template-columns:minmax(0,1fr) 160px; } }
    @media(max-width:500px) { .home-layout.fixture-main { grid-template-columns:minmax(0,1fr); } .home-layout > .layout-column-two { grid-column:1;grid-row:3; } }
  `;
  document.head.append(styles);
}
if (new URLSearchParams(location.search).get("layout") === "outer-grid") {
  const main = document.querySelector<HTMLElement>("main")!;
  const play = main.querySelector<HTMLElement>(".fixture-play")!;
  const row = main.querySelector<HTMLElement>(".fixture-row")!;
  main.style.cssText =
    'display:grid;grid-template-rows:480px auto;grid-template-areas:"play" "cards"';
  play.style.gridArea = "play";
  row.style.gridArea = "cards";
  play.querySelector("h2")!.remove();
  play.querySelector("#fixture-play")!.innerHTML =
    '<svg aria-hidden="true" width="12" height="12"></svg><strong>Play Online</strong>';
}
if (
  ["columns", "columns-flat"].includes(
    new URLSearchParams(location.search).get("layout") ?? "",
  )
) {
  const main = document.querySelector<HTMLElement>("main")!;
  const left = main.querySelector<HTMLElement>(".fixture-column")!;
  left.prepend(main.querySelector(".fixture-play")!);
  left.append(main.querySelector(".fixture-history")!);
  left.style.cssText =
    "display:grid;grid-template-rows:360px auto auto;gap:16px;min-width:0";
  const puzzle = main.querySelector<HTMLElement>(".daily-puzzle")!;
  const right = document.createElement("div");
  right.style.cssText =
    "display:flex;flex-direction:column;gap:16px;min-width:0";
  puzzle.before(right);
  right.append(puzzle);
  const stats = document.createElement("section");
  stats.className = "fixture-native-panel fixture-player-stats";
  stats.innerHTML =
    "<h2>Player Stats</h2><p>Rapid · 1755</p><p>Blitz · 1630</p><p>Bullet · 1407</p><p>Daily · 1108</p>";
  stats.style.minHeight = "300px";
  right.append(stats);
  if (new URLSearchParams(location.search).get("layout") === "columns-flat") {
    const row = main.querySelector<HTMLElement>(".fixture-row")!;
    main.classList.add("fixture-row");
    row.replaceWith(...row.children);
  }
}
if (new URLSearchParams(location.search).get("layout") === "challenge") {
  const left = document.querySelector<HTMLElement>(".fixture-column")!;
  const native = left.querySelector<HTMLElement>(".recommended-match")!;
  native.classList.remove("recommended-match");
  native.style.cssText =
    "height:100px;position:relative;box-sizing:border-box;padding:0";
  native.innerHTML =
    '<div class="fixture-challenge-body" style="position:absolute;inset:12px"><span>♞ erik · Standard · Rated</span><button class="fixture-button" style="float:right;padding:8px">Challenge</button><h2 class="recommended-match-title" style="position:absolute;bottom:0;margin:0;font-size:14px">Recommended Match</h2></div>';
  left.style.cssText = "height:100px;max-height:100px;min-width:0";
  native.querySelector("button")!.addEventListener("click", (event) => {
    (event.currentTarget as HTMLElement).textContent =
      "Challenge control still works";
  });
}
if (new URLSearchParams(location.search).get("layout") === "grid") {
  const left = document.querySelector<HTMLElement>(".fixture-column")!;
  left.classList.add("fixture-shared-slot");
  const gridRules = document.createElement("style");
  gridRules.textContent = ".fixture-shared-slot > * { grid-area:card; }";
  document.head.append(gridRules);
  left.style.cssText =
    'display:grid;grid-template-areas:"card";min-width:0;align-self:start';
  document.querySelector<HTMLElement>(".recommended-match")!.style.gridArea =
    "card";
}
const games = (source.games as RawGame[])
  .map((g) => normalizeGame(g, source.username))
  .filter((g): g is NonNullable<typeof g> => g !== null)
  .sort((a, b) => a.endTime - b.endTime);
const snapshot: Snapshot = {
  games: games.map(gameForSnapshot),
  years: [
    ...new Set([
      new Date().getFullYear(),
      ...source.archives.map((a) => Number(a.split("/").at(-2))),
    ]),
  ].sort((a, b) => b - a),
  lastSync: source.fetchedAt,
  version: 1,
};
let username = source.username;
let trackPuzzleActivity = true;
const storageListeners = new Set<
  (changes: Record<string, chrome.storage.StorageChange>) => void
>();
const fixtureChannel = new BroadcastChannel("chess-insights-puzzle-fixture");
fixtureChannel.onmessage = (e) => {
  const changes = e.data as Record<string, chrome.storage.StorageChange>;
  const next = changes["chessInsights.settings"]?.newValue as
    { trackPuzzleActivity?: boolean } | undefined;
  if (next) trackPuzzleActivity = next.trackPuzzleActivity !== false;
  storageListeners.forEach((l) => l(changes));
};
const notifyFixtureChange = (
  changes: Record<string, chrome.storage.StorageChange>,
) => {
  storageListeners.forEach((l) => l(changes));
  fixtureChannel.postMessage(changes);
};
const fixtureTx = (await database()).transaction("games", "readwrite");
for (const game of games) fixtureTx.objectStore("games").put(game);
await transactionDone(fixtureTx);
const listeners = new Set<(message: unknown) => void>();
const chromeFixture = {
  runtime: {
    id: "chess-insights-fixture",
    getURL: (path: string) => new URL(path, location.origin).href,
    sendMessage: async (message: Request): Promise<Reply<unknown>> => {
      switch (message.type) {
        case "ci:durations":
          return {
            ok: true,
            data:
              message.action === "cache"
                ? await durationSnapshot(message.username)
                : await ensureGameDurations(message.username, (progress) =>
                    listeners.forEach((listener) =>
                      listener({
                        type: "ci:duration-progress",
                        username: message.username,
                        progress,
                      }),
                    ),
                  ),
          };
        case "ci:puzzle-export":
          return { ok: true, data: await exportPuzzleBackup(message.username) };
        case "ci:puzzle-import": {
          try {
            const data = await importPuzzleBackup(
              message.username,
              message.text,
            );
            notifyFixtureChange({
              "chessInsights.puzzleChange": {
                newValue: {
                  username: message.username,
                  token: crypto.randomUUID(),
                },
              },
            });
            return { ok: true, data };
          } catch (error) {
            return {
              ok: false,
              error: { code: "BACKUP", message: String(error) },
            };
          }
        }
        case "ci:puzzles":
          return { ok: true, data: await puzzleSnapshot(message.username) };
        case "ci:puzzle-start": {
          const previous = (await puzzleSnapshot(message.username)).tracking;
          const data = trackPuzzleActivity
            ? await startPuzzleTracking(message.username)
            : null;
          if (data && !previous)
            notifyFixtureChange({
              "chessInsights.puzzleChange": {
                newValue: {
                  username: message.username,
                  token: crypto.randomUUID(),
                },
              },
            });
          return { ok: true, data };
        }
        case "ci:puzzle-save": {
          const saved =
            trackPuzzleActivity && (await savePuzzleAttempt(message.attempt));
          if (saved)
            notifyFixtureChange({
              "chessInsights.puzzleChange": {
                newValue: {
                  username: message.attempt.username,
                  token: crypto.randomUUID(),
                },
              },
            });
          return { ok: true, data: saved };
        }
        case "ci:puzzle-setting": {
          trackPuzzleActivity = message.enabled;
          notifyFixtureChange({
            "chessInsights.settings": {
              newValue: { username, trackPuzzleActivity },
            },
          });
          return { ok: true, data: { username, trackPuzzleActivity } };
        }
        case "ci:puzzle-clear": {
          await clearPuzzleHistory(message.username);
          if (trackPuzzleActivity) await startPuzzleTracking(message.username);
          notifyFixtureChange({
            "chessInsights.puzzleChange": {
              newValue: {
                username: message.username,
                token: crypto.randomUUID(),
              },
            },
          });
          return { ok: true, data: true };
        }
        case "ci:engine-status":
          return { ok: true, data: { active: false } };
        case "ci:engine-stop":
          return { ok: true, data: true };
        case "ci:replay-test":
          return { ok: true, data: storedGameReplay(games.at(-1)!) };
        case "ci:engine-test": {
          const engine = new LocalEngine(
            new URL(
              "vendor/stockfish/stockfish-18-lite-single.js",
              location.origin,
            ).href,
          );
          try {
            await engine.ready();
            const result = await engine.evaluate(
              "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            );
            return {
              ok: true,
              data: {
                success: true,
                bestMove: result.best,
                evaluation: result.score,
                engine: engine.status,
              },
            };
          } finally {
            engine.stop();
          }
        }
        case "ci:analysis":
          return { ok: true, data: await analysisRequest(message) };
        case "ci:engine-open": {
          const token = crypto.randomUUID();
          localStorage.setItem(
            `ci-engine:${token}`,
            JSON.stringify({
              username: message.username,
              expires: Date.now() + 60000,
            }),
          );
          return { ok: true, data: { token } };
        }
        case "ci:engine-claim":
        case "ci:engine-release":
        case "ci:engine-guard":
          return {
            ok: false,
            error: {
              code: "FIXTURE",
              message: "Engine host uses its own local authorization.",
            },
          };
        case "ci:settings":
          return { ok: true, data: { username, trackPuzzleActivity } };
        case "ci:snapshot":
        case "ci:sync":
          return {
            ok: true,
            data:
              message.username === source.username
                ? snapshot
                : { ...snapshot, games: [] },
          };
        case "ci:connect":
          if (message.username.toLowerCase() !== source.username)
            return {
              ok: false,
              error: {
                code: "FIXTURE",
                message: `This fixture contains public history for ${source.username} only.`,
              },
            };
          username = source.username;
          return { ok: true, data: { username } };
      }
    },
    onMessage: {
      addListener: (listener: (message: unknown) => void) =>
        listeners.add(listener),
      removeListener: (listener: (message: unknown) => void) =>
        listeners.delete(listener),
    },
  },
  storage: {
    onChanged: {
      addListener: (
        l: (changes: Record<string, chrome.storage.StorageChange>) => void,
      ) => storageListeners.add(l),
      removeListener: (
        l: (changes: Record<string, chrome.storage.StorageChange>) => void,
      ) => storageListeners.delete(l),
    },
  },
};
Object.defineProperty(window, "chrome", {
  value: chromeFixture,
  configurable: true,
});
if (
  location.pathname !== "/home" &&
  new URLSearchParams(location.search).get("navigation") !== "native-shell"
)
  history.replaceState(null, "", `/home${location.search}${location.hash}`);
const nav = document.querySelector<HTMLAnchorElement>("[data-user-menu] a");
if (nav) {
  nav.href = `/member/${source.username}`;
  nav.textContent = source.username;
}
const board = document.getElementById("fixture-board")!;
for (let i = 0; i < 64; i++) {
  const cell = document.createElement("span");
  cell.className = `fixture-square ${(Math.floor(i / 8) + i) % 2 ? "green" : ""}`;
  board?.append(cell);
}
const historyRoot = document.getElementById("fixture-history")!;
for (const g of games.slice(-4).reverse()) {
  const row = document.createElement("p");
  row.textContent = `${g.result.toUpperCase()} · ${g.opponentUsername} · ${g.timeClass} · ${g.localDate}`;
  historyRoot.append(row);
}
document.getElementById("fixture-play")!.addEventListener("click", (event) => {
  (event.target as HTMLElement).textContent = "Play control still works";
});
document
  .getElementById("fixture-puzzle")!
  .addEventListener("click", (event) => {
    (event.target as HTMLElement).textContent = "Puzzle control still works";
  });
document.getElementById("fixture-remount")!.addEventListener("click", () => {
  const main = document.querySelector("main")!;
  const next = main.cloneNode(true) as HTMLElement;
  next.querySelectorAll('[id^="chess-insights-"]').forEach((n) => n.remove());
  next
    .querySelectorAll(".ci-native-hidden")
    .forEach((n) => n.classList.remove("ci-native-hidden"));
  main.replaceWith(next);
});
document
  .getElementById("fixture-theme")!
  .addEventListener("click", () => document.body.classList.toggle("dark-mode"));
if (new URLSearchParams(location.search).get("navigation") === "remount")
  installNavigationFixture();
if (new URLSearchParams(location.search).get("navigation") === "native-shell")
  installNavigationFixture(true);
if (new URLSearchParams(location.search).get("puzzles") === "fixture")
  installPuzzleFixture();
await import("../content/chessComContent");
for (const [id, type] of [
  ["fixture-engine-test", "ci:engine-test"],
  ["fixture-replay-test", "ci:replay-test"],
] as const) {
  document.getElementById(id)!.addEventListener("click", () => {
    const output = document.getElementById("fixture-test-result")!;
    output.textContent = "Testing…";
    void chromeFixture.runtime
      .sendMessage({ type, username })
      .then((result) => {
        output.textContent = JSON.stringify(result);
      })
      .catch((error) => {
        output.textContent = String(error);
      });
  });
}
