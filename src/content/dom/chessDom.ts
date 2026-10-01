export const IDS = {
  home: "chess-insights-home-heatmap",
  app: "chess-insights-app",
  sidebar: "chess-insights-sidebar-item",
};
const own = (element: Element) =>
  !!element.closest(
    ".ci-scope, #chess-insights-sidebar-item, #chess-insights-home-heatmap, #chess-insights-app",
  );
export function getMain(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      [
        "main",
        '[role="main"]',
        ".home-content",
        ".home-layout",
        ".home-main",
        ".home-main-content",
        "#content",
        ".layout-column-one",
      ].join(","),
    ),
  ].filter((e) => !own(e));
  const homes = candidates.filter((e) =>
    e.querySelector(
      '[class*="daily-puzzle"],a[href*="daily-chess-puzzle"],[class*="home-play"]',
    ),
  );
  const home =
    homes.find((e) => e.matches('main,[role="main"]')) ??
    homes.find((e) =>
      e.matches(
        ".home-main-content,.home-main,.home-content,.layout-column-one",
      ),
    ) ??
    homes[0];
  if (home) return home;
  if (candidates.length) return candidates[0];
  const anchor = document.querySelector<HTMLElement>(
    '[class*="home-play"],[data-component="home-play"]',
  );
  if (anchor) return anchor.parentElement;
  const play = semanticText(document.body, /^play online$/i),
    puzzle = semanticText(document.body, /^daily puzzle$/i);
  const shared = play && puzzle ? commonAncestor(play, puzzle) : null;
  return shared && !["BODY", "HTML", "NAV", "ASIDE"].includes(shared.tagName)
    ? shared
    : null;
}
export function detectUsername(): string | null {
  const selectors = [
    '[data-user-menu] a[href*="/member/"]',
    'a.user-username[href*="/member/"]',
    'a.home-user-username[href*="/member/"]',
    '[class*="user-profile"] a[href*="/member/"]',
    'nav a[href*="/member/"]',
    '[class*="nav-avatar"][href*="/member/"]',
  ];
  for (const selector of selectors) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(selector)) {
      if (own(link)) continue;
      const match = new URL(link.href, location.href).pathname.match(
        /^\/member\/([a-zA-Z0-9_-]{2,30})\/?$/,
      );
      if (match) return match[1].toLowerCase();
    }
  }
  return null;
}
export function commonAncestor(a: Element, b: Element): HTMLElement | null {
  let parent = a.parentElement;
  while (parent) {
    if (parent.contains(b)) return parent;
    parent = parent.parentElement;
  }
  return null;
}
function directChild(parent: Element, element: Element): HTMLElement | null {
  let child = element as HTMLElement;
  while (child.parentElement && child.parentElement !== parent)
    child = child.parentElement;
  return child.parentElement === parent ? child : null;
}
function findHeading(main: Element, pattern: RegExp): HTMLElement | null {
  return (
    [
      ...main.querySelectorAll<HTMLElement>(
        'h1,h2,h3,h4,h5,h6,[role="heading"]',
      ),
    ].find((h) => !own(h) && pattern.test(h.textContent?.trim() ?? "")) ?? null
  );
}
export function homepageTarget(main = getMain()): {
  parent: HTMLElement;
  before: HTMLElement | null;
  strategy: string;
  row: HTMLElement;
  cards?: HTMLElement[];
  wrap?: boolean;
  promotePlay?: HTMLElement;
  groupCards?: HTMLElement[];
  playArea?: HTMLElement;
} | null {
  if (!main) return null;
  const { recommended, puzzle } = homepageAnchors(main);
  const shared =
    recommended && puzzle ? commonAncestor(recommended, puzzle) : null;
  const candidates = [
    semanticText(main, /^play online$/i),
    semanticText(main, /^play (bots|coach|a friend)$/i),
    ...main.querySelectorAll<HTMLElement>(
      '[class*="home-play"],[data-component="home-play"],a[href*="/play/online"],a[href*="/play/computer"],a[href*="/play/bots"]',
    ),
  ];
  let play =
    candidates.find(
      (candidate) =>
        candidate &&
        !own(candidate) &&
        (!recommended || !candidate.contains(recommended)) &&
        (!puzzle || !candidate.contains(puzzle)),
    ) ?? null;
  if (play) {
    // Resolve the full Play Online module, not its heading or one action link.
    while (
      play.parentElement &&
      play.parentElement !== main &&
      (!recommended || !play.parentElement.contains(recommended)) &&
      (!puzzle || !play.parentElement.contains(puzzle))
    )
      play = play.parentElement;
  }
  if (
    shared &&
    shared !== main &&
    play &&
    shared.contains(play) &&
    shared.parentElement
  ) {
    return {
      parent: shared.parentElement,
      before: shared,
      row: shared,
      cards: [shared],
      promotePlay: play,
      playArea: play,
      strategy: "play-heatmap-native-columns",
    };
  }
  if (
    shared &&
    shared !== main &&
    play &&
    !shared.contains(play) &&
    shared.parentElement
  ) {
    const hostStyle = getComputedStyle(shared.parentElement);
    return {
      parent: shared.parentElement,
      before: shared,
      row: shared,
      cards: [shared],
      promotePlay:
        play.parentElement === shared.parentElement ? play : undefined,
      wrap:
        play.parentElement !== shared.parentElement &&
        (hostStyle.display.includes("grid") ||
          (hostStyle.display.includes("flex") &&
            hostStyle.flexDirection !== "column") ||
          ["absolute", "fixed"].includes(getComputedStyle(shared).position)),
      strategy: "full-home-row",
      playArea: play ?? undefined,
    };
  }
  if (shared && play && shared.contains(play)) {
    const playArea = directChild(shared, play);
    const firstCard = directChild(shared, recommended!);
    const puzzleColumn = directChild(shared, puzzle!);
    if (
      playArea &&
      firstCard &&
      puzzleColumn &&
      playArea === firstCard &&
      firstCard !== puzzleColumn
    )
      return {
        parent: shared,
        before: firstCard,
        row: shared,
        cards: [shared],
        promotePlay: play,
        playArea: play,
        groupCards: [firstCard, puzzleColumn],
        strategy: "split-native-home-columns",
      };
    if (playArea && firstCard && playArea !== firstCard)
      return {
        parent: shared,
        before: firstCard,
        row: playArea,
        cards: [playArea],
        strategy: "after-play-full-width",
        playArea,
      };
  }
  // Wait for both native cards so the heatmap never mounts in a narrow column.
  return null;
}
export function homepageAnchors(main = getMain()) {
  if (!main) return { recommended: null, puzzle: null };
  const recommended =
    semanticText(main, /^recommended (match|game)(?:\s*\d+)?$/i) ??
    main.querySelector<HTMLElement>(
      '[class*="recommended-match"], [class*="recommended-game"], [class*="recommendedMatch"], [data-component*="recommended"], [data-testid*="recommended"]',
    ) ??
    main.querySelector<HTMLElement>(
      'a[href*="/recommended"],a[href*="/game-of-the-day"]',
    ) ??
    semanticText(main, /recommended (match|game)/i);
  const puzzle =
    semanticText(main, /^daily puzzle$/i) ??
    main.querySelector<HTMLElement>(
      '[class*="daily-puzzle"],[class*="dailyPuzzle"],[data-component*="daily-puzzle"],[data-testid*="daily-puzzle"]',
    ) ??
    semanticText(main, /daily puzzle/i) ??
    main.querySelector<HTMLElement>(
      'a[href="/daily-chess-puzzle"],a[href^="/daily-chess-puzzle/"]',
    );
  return { recommended, puzzle };
}
function semanticText(main: Element, pattern: RegExp): HTMLElement | null {
  return (
    findHeading(main, pattern) ??
    [
      ...main.querySelectorAll<HTMLElement>("a,button,span,div,strong,b,p"),
    ].find(
      (e) =>
        !own(e) &&
        (e.textContent?.length ?? 0) < 100 &&
        pattern.test(
          (e.getAttribute("aria-label") ?? e.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim(),
        ),
    ) ??
    null
  );
}
export function sidebarTarget(): {
  reference: HTMLElement;
  item: HTMLElement;
  placement: "before" | "after";
  parent: HTMLElement;
} | null {
  // Legacy Home and the newer Train/Watch sidebar use different shells. In
  // the latter, favorite and unfavorite items are in separate lists.
  const regions = [
    ...document.querySelectorAll<HTMLElement>("#sidebar-main-menu"),
    ...document.querySelectorAll<HTMLElement>(
      'nav,aside,[role="navigation"],.nav-component,.sidebar-container,#navigation,#sidebar,#sb',
    ),
    ...document.querySelectorAll<HTMLElement>('div[class*="sidebar"]'),
  ];
  for (const region of regions) {
    const controls = [
      ...region.querySelectorAll<HTMLElement>(
        'a[href],button,[role="link"],[role="button"]',
      ),
    ].filter((element) => !own(element) && menuKind(element));
    const visible = controls.filter((element) => {
      for (
        let node: HTMLElement | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (
          node.hidden ||
          node.getAttribute("aria-hidden") === "true" ||
          style.display === "none" ||
          style.visibility === "hidden"
        )
          return false;
      }
      return true;
    });
    const stats = visible.find((element) => menuKind(element) === "stats");
    const train = visible.find((element) => menuKind(element) === "train");
    const reference = stats ?? train;
    if (!reference) continue;
    // A native item is not the common ancestor of Stats and Train: that can
    // be the entire favorites list or an accordion containing several items.
    let item = reference.closest<HTMLElement>("[data-pin],li");
    if (!item || !region.contains(item)) {
      item = reference;
      while (item.parentElement && item.parentElement !== region) {
        const parent: HTMLElement = item.parentElement;
        if (
          [...parent.children].some(
            (sibling) =>
              sibling !== item &&
              controls.some(
                (control) =>
                  sibling.contains(control) &&
                  menuKind(control) !== menuKind(reference),
              ),
          )
        )
          break;
        item = parent;
      }
    }
    const parent = item.parentElement;
    if (parent && region.contains(parent))
      return { reference, item, parent, placement: stats ? "after" : "before" };
  }
  return null;
}

function menuKind(element: HTMLElement): string | null {
  const pin = element.closest("[data-pin]")?.getAttribute("data-pin");
  if (
    pin &&
    /^(play|puzzles|stats|train|watch|community|learn|other)$/.test(pin)
  )
    return pin;
  const href =
    element.getAttribute("href") ??
    element
      .closest("[data-primary-action]")
      ?.getAttribute("data-primary-action");
  if (href) {
    try {
      const path = new URL(href, location.href).pathname;
      if (/^\/stats(?:\/|$)|^\/member\/[^/]+\/stats(?:\/|$)/.test(path))
        return "stats";
      const match = path.match(
        /^\/(play|puzzles|train|training|watch|community|learn|other)(?:\/|$)/,
      );
      if (match) return match[1] === "training" ? "train" : match[1];
    } catch {
      /* A malformed native href must not abort sidebar mounting. */
    }
  }
  const label = (
    element.getAttribute("aria-label") ??
    element.querySelector(".sidebar-link-text,.nav-link-text")?.textContent ??
    element.textContent ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return /^(play|puzzles|stats|train|watch|community|learn|other)$/.test(label)
    ? label
    : null;
}
