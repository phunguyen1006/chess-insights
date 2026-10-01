// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { integrate } from "../src/content/dom/integration";
import {
  homepageTarget,
  detectUsername,
  IDS,
} from "../src/content/dom/chessDom";
import { readRoute } from "../src/content/dom/routing";
import { version } from "../public/manifest.json";
const fixture = () =>
  `<nav><a href="/play">Play</a><a href="/stats/alice">Stats</a><a href="/training">Train</a><div data-user-menu><a href="/member/Alice">Alice</a></div></nav><main><section id="play"><h2>Play Online</h2></section><div id="cards"><div id="left"><section id="recommended"><h2>Recommended Match</h2><button id="native-match">Watch</button></section><section id="history"><h2>Game History</h2></section></div><section id="puzzle"><h2>Daily Puzzle</h2><button id="native-puzzle">Try puzzle</button></section></div></main>`;
let mounted: ReturnType<typeof integrate>;
beforeEach(() => {
  document.body.innerHTML = fixture();
  history.replaceState(null, "", "/home");
  mounted = integrate({
    home: (r) => {
      r.innerHTML = '<div class="ci-scope">Heatmap</div>';
    },
    insights: (r) => {
      r.innerHTML = '<div class="ci-scope">Insights</div>';
    },
    unmount: vi.fn(),
  });
});
afterEach(() => mounted.dispose());
it("mounts only once before both native cards across the full home width", () => {
  mounted.update();
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  expect(root.parentElement?.tagName).toBe("MAIN");
  expect(root.nextElementSibling?.id).toBe("cards");
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  expect(root.style.width).toBe("100%");
  expect(root.style.gridColumn).toBe("1 / -1");
  expect(document.getElementById("puzzle")?.parentElement?.id).toBe("cards");
});
it("recognizes router buttons with nested icons and prefers the actual puzzle title over a stats class", () => {
  const play = document.getElementById("play")!;
  play.innerHTML =
    "<div><button><svg></svg><strong>Play Online</strong></button><button><span>Play Bots</span></button><button>Play Coach</button></div>";
  const stats = document.createElement("div");
  stats.className = "daily-puzzle-stats";
  stats.textContent = "Puzzles 1940";
  document.getElementById("left")!.prepend(play);
  document.getElementById("cards")!.prepend(stats);
  mounted.update();
  expect(document.getElementById(IDS.home)!.previousElementSibling).toBe(play);
  expect(
    document
      .getElementById(IDS.home)!
      .nextElementSibling!.contains(document.getElementById("puzzle")),
  ).toBe(true);
});
it.each([false, true])(
  "splits Play Online out of native left/right columns, then restores them (main columns: %s)",
  (flat) => {
    const main = document.querySelector("main")!;
    const play = document.getElementById("play")!;
    const left = document.getElementById("left")!;
    left.prepend(play);
    const original = main.innerHTML;
    if (flat)
      document
        .getElementById("cards")!
        .replaceWith(...document.getElementById("cards")!.children);
    const baseline = main.innerHTML;
    const click = vi.fn();
    document.getElementById("native-puzzle")!.addEventListener("click", click);
    mounted.update();
    mounted.update();
    const root = document.getElementById(IDS.home)!;
    expect(root.previousElementSibling).toBe(play);
    expect(
      root.nextElementSibling!.contains(document.getElementById("recommended")),
    ).toBe(true);
    expect(
      root.nextElementSibling!.contains(document.getElementById("puzzle")),
    ).toBe(true);
    expect(main.style.flexDirection).toBe("column");
    expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
    document.getElementById("native-puzzle")!.click();
    expect(click).toHaveBeenCalledOnce();
    mounted.dispose();
    expect(play.parentElement).toBe(left);
    expect(main.innerHTML.replace(/ style=""/g, "")).toBe(
      flat ? baseline : original,
    );
  },
);
it("matches the complete row width, including the puzzle", () => {
  const rect = (left: number, width: number) =>
    ({
      left,
      right: left + width,
      width,
      top: 0,
      bottom: 100,
      height: 100,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  vi.spyOn(
    document.getElementById("cards")!,
    "getBoundingClientRect",
  ).mockReturnValue(rect(20, 487));
  vi.spyOn(
    document.querySelector("main")!,
    "getBoundingClientRect",
  ).mockReturnValue(rect(20, 487));
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  vi.spyOn(root, "getBoundingClientRect").mockReturnValue(rect(20, 487));
  expect(root.style.width).toBe("100%");
  expect(mounted.getHeatmapGeometry().aligned).toBe(true);
});
it("replaces the outer fixed grid flow instead of inheriting a lower native grid slot", () => {
  const main = document.querySelector("main")!;
  main.style.cssText =
    'display:grid;grid-template-rows:480px auto;grid-template-areas:"play" "cards"';
  document.getElementById("play")!.style.gridArea = "play";
  document.getElementById("cards")!.style.gridArea = "cards";
  const original = main.style.cssText;
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  expect(main.style.display).toBe("flex");
  expect(root.previousElementSibling?.id).toBe("play");
  expect(root.nextElementSibling?.id).toBe("cards");
  expect(document.getElementById("cards")!.style.gridArea).toBe("auto");
  expect(root.dataset.layoutBuild).toBe(version);
  mounted.dispose();
  expect(main.style.cssText).toBe(original);
  expect(document.getElementById("cards")!.style.gridArea).toBe("cards");
});
it("makes and restores a flow column for flat sibling cards without losing native handlers", () => {
  const left = document.getElementById("left")!;
  left.replaceWith(...left.children);
  const click = vi.fn();
  document.getElementById("native-match")!.addEventListener("click", click);
  mounted.update();
  expect(document.getElementById(IDS.home)?.nextElementSibling?.id).toBe(
    "cards",
  );
  document.getElementById("native-match")!.click();
  expect(click).toHaveBeenCalledOnce();
  location.hash = "chess-insights/overview";
  mounted.update();
  location.hash = "";
  mounted.update();
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  document.getElementById("native-match")!.click();
  expect(click).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll(".ci-native-column")).toHaveLength(0);
});
it("waits for a reliable recommendation anchor instead of mounting a full-row fallback", () => {
  document.getElementById("recommended")?.remove();
  expect(homepageTarget()).toBeNull();
  mounted.update();
  expect(document.getElementById(IDS.home)).toBeNull();
});
it("inserts a complete grid row after Play Online and restores explicit native row positions", () => {
  const main = document.querySelector("main")!;
  document
    .getElementById("left")!
    .replaceWith(...document.getElementById("left")!.children);
  document
    .getElementById("cards")!
    .replaceWith(...document.getElementById("cards")!.children);
  main.style.cssText = "display:grid;grid-template-columns:2fr 1fr";
  document.getElementById("play")!.style.gridRowStart = "1";
  document.getElementById("recommended")!.style.gridRowStart = "2";
  document.getElementById("puzzle")!.style.gridRowStart = "2";
  document.getElementById("history")!.style.gridRowStart = "3";
  mounted.update();
  expect(document.getElementById(IDS.home)!.style.gridRow).toBe("2 / span 1");
  expect(document.getElementById("recommended")!.style.gridRowStart).toBe("3");
  expect(document.getElementById("puzzle")!.style.gridRowStart).toBe("3");
  expect(document.getElementById("history")!.style.gridRowStart).toBe("4");
  mounted.dispose();
  expect(document.getElementById("recommended")!.style.gridRowStart).toBe("2");
  expect(document.getElementById("puzzle")!.style.gridRowStart).toBe("2");
  expect(document.getElementById("history")!.style.gridRowStart).toBe("3");
});
it("handles Chess.com's reported mix of an auto left row and a sidebar pinned to row 2/span 2", () => {
  const main = document.querySelector("main")!;
  document
    .getElementById("cards")!
    .replaceWith(...document.getElementById("cards")!.children);
  main.style.cssText =
    "display:grid;grid-template-columns:728px 300px;gap:20px 24px";
  const hero = document.getElementById("play")!;
  hero.style.gridColumn = "1 / -1";
  const left = document.getElementById("left")!;
  left.style.gridColumn = "1";
  const side = document.getElementById("puzzle")!;
  side.style.cssText = "grid-column:2;grid-row:2 / span 2";
  const original = side.style.cssText;
  const click = vi.fn();
  document.getElementById("native-puzzle")!.addEventListener("click", click);
  mounted.update();
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  expect(root.style.gridRow).toBe("2 / span 1");
  expect(root.style.margin).toBe("0px");
  expect(left.style.gridRowStart).toBe("3");
  expect(side.style.gridRowStart).toBe("3");
  expect(
    side.style.gridRowEnd || side.style.gridRow.split("/")[1]?.trim(),
  ).toBe("span 2");
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  document.getElementById("native-puzzle")!.click();
  expect(click).toHaveBeenCalledOnce();
  mounted.dispose();
  expect(left.style.gridRowStart).toBe("");
  expect(side.style.cssText).toBe(original);
});
it("mounts outside the full native row when the recommendation class is only on a title", () => {
  document.getElementById("recommended")!.outerHTML =
    '<div id="challenge" style="height:84px;position:relative"><div style="position:absolute;inset:0"><button id="challenge-control">Challenge</button><div class="recommended-match-title">Recommended Match</div></div></div>';
  const left = document.getElementById("left")!;
  left.style.cssText = "height:84px;max-height:84px";
  const original = left.style.cssText;
  const click = vi.fn();
  document
    .getElementById("challenge-control")!
    .addEventListener("click", click);
  mounted.update();
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  expect(root.nextElementSibling?.id).toBe("cards");
  expect(
    document.querySelector(".recommended-match-title")?.closest("#challenge"),
  ).not.toBeNull();
  expect(left.style.height).toBe("84px");
  expect(left.style.maxHeight).toBe("84px");
  expect(document.getElementById("history")?.previousElementSibling?.id).toBe(
    "challenge",
  );
  document.getElementById("challenge-control")!.click();
  expect(click).toHaveBeenCalledOnce();
  mounted.dispose();
  expect(left.style.cssText).toBe(original);
});
it("leaves native nested grid coordinates intact by mounting outside the entire row", () => {
  const left = document.getElementById("left")!,
    card = document.getElementById("recommended")!;
  left.style.cssText = 'display:grid;grid-template-areas:"card"';
  card.style.cssText =
    "grid-area:card;position:absolute;top:0;transform:translateY(-10px)";
  const original = card.style.cssText;
  mounted.update();
  mounted.update();
  const root = document.getElementById(IDS.home)!;
  expect(root.nextElementSibling?.id).toBe("cards");
  expect(card.style.cssText).toBe(original);
  expect(root.style.position).toBe("relative");
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  location.hash = "chess-insights/mistakes";
  mounted.update();
  expect(card.style.cssText).toBe(original);
  expect(document.getElementById("puzzle")?.parentElement?.id).toBe("cards");
});
it("recovers after delayed rendering and SPA main replacement", () => {
  document.querySelector("main")!.innerHTML = "";
  mounted.update();
  expect(document.getElementById(IDS.home)).toBeNull();
  document.querySelector("main")!.outerHTML = fixture().slice(
    fixture().indexOf("<main>"),
  );
  mounted.update();
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
});
it("remounts a removed heatmap while the same native homepage remains", () => {
  mounted.update();
  const original = document.getElementById(IDS.home)!;
  original.remove();
  expect(() => mounted.update()).not.toThrow();
  expect(document.getElementById(IDS.home)).not.toBe(original);
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  expect(document.getElementById(IDS.home)!.nextElementSibling?.id).toBe(
    "cards",
  );
});
it("rebuilds placement when the native cards are replaced within the same main", () => {
  mounted.update();
  const replacement = document.createElement("div");
  replacement.id = "cards";
  replacement.innerHTML =
    "<section><h2>Recommended Match</h2></section><section><h2>Daily Puzzle</h2></section>";
  document.getElementById("cards")!.replaceWith(replacement);
  expect(() => mounted.update()).not.toThrow();
  expect(document.querySelectorAll(`#${IDS.home}`)).toHaveLength(1);
  expect(document.getElementById(IDS.home)!.nextElementSibling).toBe(
    replacement,
  );
});
it("inserts sidebar Insights between Stats and Train without duplicating it", () => {
  mounted.update();
  mounted.update();
  const item = document.getElementById(IDS.sidebar)!;
  expect(item.previousElementSibling?.textContent).toBe("Stats");
  expect(item.nextElementSibling?.textContent).toBe("Train");
  expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
});
it("detects account anchors and ignores opponent links", () => {
  expect(detectUsername()).toBe("alice");
  document.querySelector("[data-user-menu]")?.remove();
  document.querySelector("main")!.innerHTML =
    '<a href="/member/opponent">Opponent</a>';
  expect(detectUsername()).toBeNull();
});
it("hides and restores native modules and keeps puzzle controls functional", () => {
  const click = vi.fn();
  document.getElementById("native-puzzle")!.addEventListener("click", click);
  mounted.update();
  location.hash = "chess-insights/time";
  mounted.update();
  expect(
    document.getElementById("cards")?.classList.contains("ci-native-hidden"),
  ).toBe(true);
  location.hash = "";
  mounted.update();
  expect(document.querySelectorAll(".ci-native-hidden")).toHaveLength(0);
  document.getElementById("native-puzzle")!.click();
  expect(click).toHaveBeenCalledOnce();
});
it.each(["/game/live/123", "/live", "/play/online", "/play/computer"])(
  "never mounts on %s",
  (path) => {
    history.replaceState(null, "", `${path}#chess-insights/mistakes`);
    mounted.update();
    expect(document.getElementById(IDS.app)).toBeNull();
    expect(document.getElementById(IDS.home)).toBeNull();
  },
);
it("removes historical UI if an active-clock marker appears", () => {
  location.hash = "chess-insights/mistakes";
  mounted.update();
  expect(document.getElementById(IDS.app)).not.toBeNull();
  const clock = document.createElement("div");
  clock.className = "clock-player-turn";
  document.body.append(clock);
  mounted.update();
  expect(document.getElementById(IDS.app)).toBeNull();
});
it("reads isolated historical routes and timeout filter", () => {
  expect(readRoute("#other")).toBeNull();
  expect(readRoute("#chess-insights/activity?date=2026-09-29")).toEqual({
    section: "activity",
    date: "2026-09-29",
  });
  expect(readRoute("#chess-insights/results?termination=Timeout")).toEqual({
    section: "results",
    date: "",
    termination: "Timeout",
  });
});
