// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { IDS } from "../src/content/dom/chessDom";
import { integrate } from "../src/content/dom/integration";
import { observePage } from "../src/content/dom/pageObserver";
import { sidebarComplete } from "../src/content/dom/sidebarMount";

const menu = () =>
  '<nav aria-label="Main navigation"><ul><li><a href="/stats/alice">Stats</a></li><li><a href="/training">Train</a></li><li><a href="/watch">Watch</a></li><li><a href="/community">Community</a></li></ul></nav>';
// Native Watch shell: top-level items are pinned/unpinned independently and
// each native item has separate desktop-link and mobile-button controls.
const modernMenu = (
  stats = true,
) => `<nav id="sidebar-main-menu" class="sidebar-container">
  <div class="sidebar-pinned-tabs-wrapper">
    <div id="favorited-tabs"><div data-pin="play"><a href="/play">Play</a></div>
      ${stats ? '<div data-pin="stats" class="native-item"><div class="sidebar-link-desktop-wrapper"><a class="sidebar-link selected" href="/stats/alice"><span class="sidebar-link-text">Stats</span></a></div><div style="display:none"><button class="sidebar-link sidebar-desktop-hidden"><span class="sidebar-link-text">Stats</span></button></div></div>' : ""}
    </div>
    <div class="sidebar-unfavorited-tabs"><div id="unfavorited-tabs">
      <div data-pin="train"><div><a class="sidebar-link active" href="/train"><span class="sidebar-link-text">Train</span></a></div></div>
      <div data-pin="watch"><a href="/watch">Watch</a></div>
    </div></div>
  </div>
</nav>`;
let integration: ReturnType<typeof integrate>;
let watcher: ReturnType<typeof observePage>;
let update: Mock<() => void>;

beforeEach(async () => {
  vi.useFakeTimers();
  history.replaceState(null, "", "/home");
  document.body.innerHTML = `${menu()}<main><h1>Native page</h1></main>`;
  integration = integrate({
    home: vi.fn(),
    insights: vi.fn(),
    unmount: vi.fn(),
  });
  update = vi.fn(integration.update);
  integration.update();
  watcher = observePage(update);
  // Native navigation is handled by the page, not by the extension.
  document.querySelector("nav")!.addEventListener("click", (event) => {
    event.preventDefault();
  });
  await vi.advanceTimersByTimeAsync(0);
});

afterEach(() => {
  watcher.dispose();
  integration.dispose();
  vi.useRealTimers();
});

const expectMenu = () => {
  const item = document.getElementById(IDS.sidebar)!;
  expect(sidebarComplete()).toBe(true);
  expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
  expect(item.previousElementSibling?.textContent).toBe("Stats");
  expect(item.nextElementSibling?.textContent).toBe("Train");
  expect(item.querySelector("a")?.getAttribute("href")).toBe(
    "/home#chess-insights/overview",
  );
};

it("repairs an isolated Insights removal after the initial navigation check already finished", async () => {
  const train = document.querySelector<HTMLAnchorElement>(
    'a[href="/training"]',
  )!;
  train.addEventListener("click", () => {
    history.pushState(null, "", "/training");
    document.querySelector("main")!.innerHTML = "<h1>Train</h1>";
    setTimeout(() => document.getElementById(IDS.sidebar)!.remove(), 450);
  });
  train.click();
  await vi.advanceTimersByTimeAsync(200);
  expectMenu();
  await vi.advanceTimersByTimeAsync(300);
  expect(document.getElementById(IDS.sidebar)).toBeNull();
  await vi.advanceTimersByTimeAsync(180);
  expectMenu();
  const count = update.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(update).toHaveBeenCalledTimes(count);
});

it("survives repeated Train/Watch/Community navigation and replacement of the entire menu", async () => {
  for (const path of [
    "/training",
    "/watch",
    "/community",
    "/training",
    "/home",
  ]) {
    history.pushState(null, "", path);
    document.querySelector("nav")!.outerHTML = menu();
    await vi.advanceTimersByTimeAsync(200);
    expectMenu();
    expect(document.getElementById(IDS.app)).toBeNull();
  }
});

it("repairs a missing item during continuous native updates instead of debouncing forever", async () => {
  document.getElementById(IDS.sidebar)!.remove();
  let frame = 0;
  const interval = setInterval(() => {
    document.querySelector("nav")!.className = `native-frame-${++frame}`;
  }, 40);
  await vi.advanceTimersByTimeAsync(200);
  expectMenu();
  clearInterval(interval);
  await vi.advanceTimersByTimeAsync(200);
  const count = update.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(update).toHaveBeenCalledTimes(count);
});

it.each(["empty wrapper", "changed label", "changed destination"])(
  "repairs a %s even though its position and ID are unchanged",
  async (damage) => {
    const item = document.getElementById(IDS.sidebar)!;
    if (damage === "empty wrapper") item.replaceChildren();
    else if (damage === "changed label")
      item.querySelector("span")!.firstChild!.textContent = "Stats";
    else item.querySelector("a")!.setAttribute("href", "/watch");
    await vi.advanceTimersByTimeAsync(200);
    expectMenu();
  },
);

it("waits for the delayed native Stats/Train anchors and repairs when they arrive", async () => {
  document.querySelector("nav")!.innerHTML = "<ul><li>Loading menu</li></ul>";
  await vi.advanceTimersByTimeAsync(200);
  expect(document.getElementById(IDS.sidebar)).toBeNull();
  document.querySelector("nav")!.outerHTML = menu();
  await vi.advanceTimersByTimeAsync(200);
  expectMenu();
});

it("ignores healthy extension rendering and preserves native navigation listeners", async () => {
  const train = document.querySelector<HTMLAnchorElement>(
    'a[href="/training"]',
  )!;
  const nativeClick = vi.fn();
  train.addEventListener("click", nativeClick);
  const surface = document.createElement("div");
  surface.id = IDS.app;
  surface.innerHTML = '<div class="ci-scope">Loading analytics</div>';
  document.querySelector("main")!.append(surface);
  surface.querySelector("div")!.textContent = "Analytics loaded";
  document
    .getElementById(IDS.sidebar)!
    .querySelector("a")!
    .classList.add("hover");
  await vi.advanceTimersByTimeAsync(500);
  expect(update).not.toHaveBeenCalled();
  train.click();
  await vi.advanceTimersByTimeAsync(200);
  expect(nativeClick).toHaveBeenCalledOnce();
  expect(document.querySelector('a[href="/training"]')).toBe(train);
  expectMenu();
});

it("updates selection on back/forward and stops observers and pending work on disposal", async () => {
  history.replaceState(null, "", "/home#chess-insights/overview");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await vi.advanceTimersByTimeAsync(200);
  expect(
    document
      .getElementById(IDS.sidebar)!
      .querySelector("a")!
      .getAttribute("aria-current"),
  ).toBe("page");
  history.replaceState(null, "", "/watch");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await vi.advanceTimersByTimeAsync(200);
  expectMenu();
  expect(
    document
      .getElementById(IDS.sidebar)!
      .querySelector("a")!
      .hasAttribute("aria-current"),
  ).toBe(false);
  watcher.schedule();
  watcher.dispose();
  update.mockClear();
  document.getElementById(IDS.sidebar)!.remove();
  window.dispatchEvent(new PopStateEvent("popstate"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(update).not.toHaveBeenCalled();
  expect(document.getElementById(IDS.sidebar)).toBeNull();
});

it.each(["/watch", "/train"])(
  "mounts on a fresh %s document with separate favorites lists and no homepage main",
  async (path) => {
    history.replaceState(null, "", path);
    document.body.innerHTML = modernMenu();
    integration.update();
    await vi.advanceTimersByTimeAsync(200);
    const item = document.getElementById(IDS.sidebar)!;
    expect(sidebarComplete(item)).toBe(true);
    expect(item.parentElement?.id).toBe("favorited-tabs");
    expect(item.previousElementSibling?.getAttribute("data-pin")).toBe("stats");
    expect(item.querySelector("[data-pin]")).toBeNull();
    expect(item.hasAttribute("data-pin")).toBe(false);
    expect(item.querySelector("#favorited-tabs,#unfavorited-tabs")).toBeNull();
    expect(document.querySelectorAll("#favorited-tabs")).toHaveLength(1);
    expect(item.querySelector(".selected,.active")).toBeNull();
    expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
    expect(document.getElementById(IDS.home)).toBeNull();
    expect(document.getElementById(IDS.app)).toBeNull();
  },
);

it("inserts before Train when Stats is absent and does not inherit active Train styling", async () => {
  history.replaceState(null, "", "/watch");
  document.body.innerHTML = modernMenu(false);
  await vi.advanceTimersByTimeAsync(200);
  const item = document.getElementById(IDS.sidebar)!;
  expect(sidebarComplete()).toBe(true);
  expect(item.parentElement?.id).toBe("unfavorited-tabs");
  expect(item.nextElementSibling?.getAttribute("data-pin")).toBe("train");
  expect(item.querySelector(".active")).toBeNull();
  expect(document.querySelector('[data-pin="train"] .active')).not.toBeNull();
});

it("recognizes legacy semantic buttons and preserves their native listeners", async () => {
  document.body.innerHTML =
    '<div class="nav-component"><button aria-label="Stats"><svg></svg><span>Stats</span></button><button aria-label="Train">Train</button></div>';
  const stats = document.querySelector("button")!;
  const click = vi.fn();
  stats.addEventListener("click", click);
  await vi.advanceTimersByTimeAsync(200);
  const item = document.getElementById(IDS.sidebar)!;
  expect(item.previousElementSibling).toBe(stats);
  expect(item.nextElementSibling?.textContent).toBe("Train");
  stats.click();
  expect(click).toHaveBeenCalledOnce();
  expect(sidebarComplete()).toBe(true);
});

it("uses a visible mobile control without copying native responsive hiding classes", async () => {
  document.body.innerHTML = modernMenu();
  const desktop = document.querySelector<HTMLElement>(
    '[data-pin="stats"] .sidebar-link-desktop-wrapper',
  )!;
  desktop.style.display = "none";
  (desktop.nextElementSibling as HTMLElement).style.display = "block";
  window.dispatchEvent(new Event("resize"));
  await vi.advanceTimersByTimeAsync(200);
  const item = document.getElementById(IDS.sidebar)!;
  expect(sidebarComplete()).toBe(true);
  expect(
    item.querySelector(".sidebar-desktop-hidden,.sidebar-mobile-hidden"),
  ).toBeNull();
  expect(item.parentElement?.id).toBe("favorited-tabs");
});

it("continues repairing after the entire body is replaced by another application shell", async () => {
  const next = document.createElement("body");
  next.innerHTML = modernMenu();
  document.body.replaceWith(next);
  await vi.advanceTimersByTimeAsync(200);
  expect(sidebarComplete()).toBe(true);
  document.getElementById(IDS.sidebar)!.remove();
  await vi.advanceTimersByTimeAsync(200);
  expect(sidebarComplete()).toBe(true);
  expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
});

it("removes a cloned duplicate and repairs an item moved to the wrong menu list", async () => {
  document.body.innerHTML = modernMenu();
  await vi.advanceTimersByTimeAsync(200);
  const item = document.getElementById(IDS.sidebar)!;
  document.getElementById("unfavorited-tabs")!.prepend(item.cloneNode(true));
  // The native menu renderer can clone/move injected nodes along with its UI.
  window.dispatchEvent(new Event("resize"));
  await vi.advanceTimersByTimeAsync(200);
  expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
  document.getElementById("unfavorited-tabs")!.append(item);
  await vi.advanceTimersByTimeAsync(200);
  expect(document.getElementById(IDS.sidebar)!.parentElement?.id).toBe(
    "favorited-tabs",
  );
  expect(sidebarComplete()).toBe(true);
});

it("keeps the native Watch page visible if SPA navigation retains an old Insights hash", async () => {
  history.replaceState(null, "", "/watch#chess-insights/overview");
  document.body.innerHTML = `${modernMenu()}<main><h1>Watch</h1></main>`;
  await vi.advanceTimersByTimeAsync(200);
  expect(sidebarComplete()).toBe(true);
  expect(document.getElementById(IDS.app)).toBeNull();
  expect(document.querySelector("main h1")?.textContent).toBe("Watch");
  expect(document.querySelector(".ci-native-hidden")).toBeNull();
  expect(document.querySelector(`#${IDS.sidebar} [aria-current]`)).toBeNull();
});

it("chooses the active menu instead of an old menu inside a hidden outer application shell", async () => {
  document.body.innerHTML = `<div style="display:none">${modernMenu()}</div>
    <div id="active-shell">${menu()}</div>`;
  await vi.advanceTimersByTimeAsync(200);
  const item = document.getElementById(IDS.sidebar)!;
  expect(item.closest("#active-shell")).not.toBeNull();
  expect(sidebarComplete()).toBe(true);
  expect(document.querySelectorAll(`#${IDS.sidebar}`)).toHaveLength(1);
});
