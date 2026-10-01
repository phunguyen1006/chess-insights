import { getMain, homepageTarget, homepageAnchors, IDS } from "./chessDom";
import { mountSidebar } from "./sidebarMount";
import { readRoute } from "./routing";
import { liveContext } from "../../analysis/safety";
import { captureOriginalLayout, LAYOUT_BUILD } from "./layoutReport";
export interface MountHandlers {
  home: (root: HTMLElement) => void;
  insights: (root: HTMLElement) => void;
  unmount: (root: HTMLElement) => void;
}
export function integrate(handlers: MountHandlers) {
  let main: HTMLElement | null = null,
    homeRoot: HTMLElement | null = null,
    appRoot: HTMLElement | null = null;
  const hidden = new Set<HTMLElement>();
  const hiddenDisplays = new Map<
    HTMLElement,
    { value: string; priority: string }
  >();
  let target: ReturnType<typeof homepageTarget> = null;
  let diagnostic = "";
  let routeKey = "";
  let sizing: ResizeObserver | null = null;
  let column: HTMLElement | null = null;
  let nativeCardStyle: string | null = null;
  let flowHost: HTMLElement | null = null;
  let originalGap = "";
  let originalGapPriority = "";
  let geometrySignature = "";
  let placeGridRows: (() => void) | null = null;
  let promotedPlay: {
    node: HTMLElement;
    marker: Comment;
    style: string;
  } | null = null;
  let groupedRow: HTMLElement | null = null;
  const groupedNodes: { node: HTMLElement; marker: Comment; style: string }[] =
    [];
  const nativeHostStyles = new Map<
    HTMLElement,
    { property: string; value: string; priority: string }[]
  >();
  const sizeHeatmap = () => {
    if (!homeRoot || !target) return;
    placeGridRows?.();
    const rects = target.cards?.map((e) => e.getBoundingClientRect()) ?? [
      target.row.getBoundingClientRect(),
    ];
    const left = Math.min(...rects.map((r) => r.left)),
      right = Math.max(...rects.map((r) => r.right)),
      width = right - left;
    if (width <= 0) return; // jsdom or not-yet-visible native row
    const parent = target.parent.getBoundingClientRect(),
      padding =
        (parseFloat(getComputedStyle(target.parent).paddingLeft) || 0) +
        (parseFloat(getComputedStyle(target.parent).borderLeftWidth) || 0);
    const nativeStyle = getComputedStyle(target.parent),
      shift = Math.max(0, left - parent.left - padding),
      contentWidth =
        parent.width -
        padding -
        (parseFloat(nativeStyle.paddingRight) || 0) -
        (parseFloat(nativeStyle.borderRightWidth) || 0);
    homeRoot.style.width =
      Math.abs(contentWidth - width) <= 2 && shift <= 2 ? "100%" : `${width}px`;
    if (import.meta.env.DEV) {
      const details = geometry(),
        signature = JSON.stringify(details);
      if (signature !== geometrySignature) {
        console.debug("[Chess Insights] Heatmap geometry", details);
        geometrySignature = signature;
      }
    }
  };
  const log = (message: string, details?: unknown) => {
    if (import.meta.env.DEV && diagnostic !== message) {
      console.debug(`[Chess Insights] ${message}`, details ?? "");
      diagnostic = message;
    }
  };
  const restore = () => {
    hidden.forEach((child) => {
      child.classList.remove("ci-native-hidden");
      const original = hiddenDisplays.get(child);
      if (original?.value)
        child.style.setProperty("display", original.value, original.priority);
      else child.style.removeProperty("display");
    });
    hidden.clear();
    hiddenDisplays.clear();
  };
  const remove = (kind: "home" | "app") => {
    const root = kind === "home" ? homeRoot : appRoot;
    if (root) {
      handlers.unmount(root);
      root.remove();
      if (kind === "home") diagnostic = "";
    }
    if (kind === "home") homeRoot = null;
    else appRoot = null;
    if (kind === "home") {
      placeGridRows = null;
      sizing?.disconnect();
      sizing = null;
      if (column?.isConnected) {
        const card = target?.cards?.[0];
        if (card && nativeCardStyle !== null)
          card.style.cssText = nativeCardStyle;
        column.replaceWith(...column.childNodes);
      }
      nativeCardStyle = null;
      if (promotedPlay) {
        promotedPlay.node.style.cssText = promotedPlay.style;
        if (promotedPlay.marker.isConnected)
          promotedPlay.marker.replaceWith(promotedPlay.node);
        promotedPlay = null;
      }
      groupedNodes.forEach(({ node, marker, style }) => {
        node.style.cssText = style;
        if (marker.isConnected) marker.replaceWith(node);
      });
      groupedNodes.length = 0;
      groupedRow?.remove();
      groupedRow = null;
      nativeHostStyles.forEach((properties, host) => {
        properties.forEach(({ property, value, priority }) => {
          if (value) host.style.setProperty(property, value, priority);
          else host.style.removeProperty(property);
        });
      });
      nativeHostStyles.clear();
      if (flowHost) {
        if (originalGap)
          flowHost.style.setProperty(
            "row-gap",
            originalGap,
            originalGapPriority,
          );
        else flowHost.style.removeProperty("row-gap");
      }
      flowHost = null;
      column = null;
      target = null;
    }
  };
  const update = () => {
    mountSidebar();
    const next = getMain(),
      live = liveContext();
    if (next !== main) {
      restore();
      remove("home");
      remove("app");
      main = next;
      target = null;
    }
    if (!main || live) {
      restore();
      remove("home");
      remove("app");
      return;
    }
    const route = ["/", "/home"].includes(location.pathname)
      ? readRoute()
      : null;
    if (route) {
      remove("home");
      if (appRoot && !appRoot.isConnected) remove("app");
      if (!appRoot) {
        appRoot = document.createElement("div");
        appRoot.id = IDS.app;
        appRoot.style.cssText = "grid-column:1 / -1;min-width:0;width:100%";
        main.append(appRoot);
        handlers.insights(appRoot);
      }
      for (const child of main.children) {
        if (child !== appRoot && child instanceof HTMLElement) {
          if (!hiddenDisplays.has(child))
            hiddenDisplays.set(child, {
              value: child.style.getPropertyValue("display"),
              priority: child.style.getPropertyPriority("display"),
            });
          child.style.setProperty("display", "none", "important");
          if (!child.classList.contains("ci-native-hidden"))
            child.classList.add("ci-native-hidden");
          hidden.add(child);
        }
      }
      return;
    }
    restore();
    remove("app");
    if (!["/home", "/"].includes(location.pathname)) {
      remove("home");
      return;
    }
    // Native SPA rendering may remove our root or replace its anchors without
    // replacing <main>. Restore old layout overrides before rediscovering the
    // mount point; remove() clears target, so it must precede discovery.
    if (
      homeRoot &&
      (!homeRoot.isConnected ||
        !target?.parent.isConnected ||
        (target.before && !target.before.isConnected) ||
        (target.playArea && !target.playArea.isConnected) ||
        target.cards?.some((card) => !card.isConnected))
    )
      remove("home");
    const key = location.pathname + location.hash;
    if (key !== routeKey) {
      routeKey = key;
      target = null;
      log("Homepage detected");
    }
    if (
      target?.strategy === "after-play-area" ||
      !target?.parent.isConnected ||
      (target.before && !target.before.isConnected)
    )
      target = homepageTarget(main);
    if (!target) {
      log("Homepage detected · mount anchors pending", {
        attemptedStrategies: [
          "stable selectors",
          "semantic card anchors",
          "history-preceding-row",
          "after-play-area",
        ],
      });
      remove("home");
      return;
    }
    if (!homeRoot) {
      if (import.meta.env.DEV) captureOriginalLayout();
      if (target.groupCards && target.before) {
        const hostStyle = getComputedStyle(target.parent);
        groupedRow = document.createElement("div");
        groupedRow.className = "ci-native-home-row";
        groupedRow.style.cssText =
          "display:grid;gap:16px;min-width:0;width:100%;align-items:start;box-sizing:border-box";
        groupedRow.style.gridTemplateColumns =
          hostStyle.gridTemplateColumns &&
          hostStyle.gridTemplateColumns !== "none"
            ? hostStyle.gridTemplateColumns.replace(
                /([\d.]+)px/g,
                "minmax(0,$1fr)",
              )
            : "minmax(0,2fr) minmax(0,1fr)";
        target.parent.insertBefore(groupedRow, target.before);
        for (const node of target.groupCards) {
          const marker = document.createComment(
            "Chess Insights: native home column location",
          );
          groupedNodes.push({ node, marker, style: node.style.cssText });
          node.before(marker);
          groupedRow.append(node);
          Object.assign(node.style, {
            gridArea: "auto",
            gridColumn: "auto",
            gridRow: "auto",
            position: "static",
            inset: "auto",
            transform: "none",
            width: "100%",
            minWidth: "0",
            margin: "0",
          });
        }
        target = {
          ...target,
          before: groupedRow,
          row: groupedRow,
          cards: [groupedRow],
        };
      }
      if (target.promotePlay && target.before) {
        const node = target.promotePlay;
        const originalParent = node.parentElement!;
        const marker = document.createComment(
          "Chess Insights: native Play Online location",
        );
        promotedPlay = { node, marker, style: node.style.cssText };
        node.before(marker);
        target.parent.insertBefore(node, target.before);
        // Remove the vacant Play grid track from the old left column. Native
        // named areas can otherwise reserve its old height above the cards.
        const columnProperties = [
          "display",
          "flex-direction",
          "height",
          "min-height",
          "max-height",
          "gap",
        ];
        if (originalParent !== target.parent) {
          nativeHostStyles.set(
            originalParent,
            columnProperties.map((property) => ({
              property,
              value: originalParent.style.getPropertyValue(property),
              priority: originalParent.style.getPropertyPriority(property),
            })),
          );
          Object.assign(originalParent.style, {
            display: "flex",
            flexDirection: "column",
            height: "auto",
            minHeight: "0",
            maxHeight: "none",
            gap: "16px",
          });
        }
        Object.assign(node.style, {
          position: "static",
          inset: "auto",
          transform: "none",
          gridArea: "auto",
          width: "100%",
          maxWidth: "none",
          boxSizing: "border-box",
          margin: "0",
        });
        const properties = [
          "display",
          "flex-direction",
          "align-items",
          "row-gap",
        ];
        nativeHostStyles.set(
          target.parent,
          properties.map((property) => ({
            property,
            value: target!.parent.style.getPropertyValue(property),
            priority: target!.parent.style.getPropertyPriority(property),
          })),
        );
        target.parent.style.setProperty("display", "flex", "important");
        target.parent.style.setProperty(
          "flex-direction",
          "column",
          "important",
        );
        target.parent.style.setProperty("align-items", "stretch", "important");
        target.parent.style.setProperty("row-gap", "0", "important");
        const row = target.before;
        const rowProperties = [
          "position",
          "inset",
          "transform",
          "grid-area",
          "width",
          "max-width",
          "margin",
        ];
        nativeHostStyles.set(
          row,
          rowProperties.map((property) => ({
            property,
            value: row.style.getPropertyValue(property),
            priority: row.style.getPropertyPriority(property),
          })),
        );
        Object.assign(row.style, {
          position: "static",
          inset: "auto",
          transform: "none",
          gridArea: "auto",
          width: "100%",
          maxWidth: "none",
          margin: "16px 0 0",
        });
      }
      // Native home slots may have a fixed height or fixed grid tracks. Adding
      // content inside one must grow the enclosing layout, including history.
      for (
        let host = target.parent;
        host && main.contains(host);
        host = host.parentElement!
      ) {
        const style = getComputedStyle(host);
        const properties = ["height", "max-height"];
        const rows = style.gridTemplateRows;
        if (style.display.includes("grid") && /\d+(?:\.\d+)?px/.test(rows))
          properties.push("grid-template-rows");
        nativeHostStyles.set(host, [
          ...(nativeHostStyles.get(host) ?? []),
          ...properties.map((property) => ({
            property,
            value: host.style.getPropertyValue(property),
            priority: host.style.getPropertyPriority(property),
          })),
        ]);
        host.style.setProperty("height", "auto", "important");
        host.style.setProperty("max-height", "none", "important");
        if (properties.includes("grid-template-rows"))
          host.style.setProperty(
            "grid-template-rows",
            rows.replace(/\d+(?:\.\d+)?px/g, "auto"),
            "important",
          );
        if (host === main) break;
      }
      if (target.wrap && target.before) {
        column = document.createElement("div");
        column.className = "ci-native-column";
        const nativeStyle = getComputedStyle(target.before);
        column.style.cssText =
          "min-width:0;display:flex;flex-direction:column;gap:10px;position:relative;box-sizing:border-box;align-self:start;";
        column.style.flex =
          nativeStyle.flex === "0 1 auto" ? "1 1 0%" : nativeStyle.flex;
        column.style.gridColumn =
          nativeStyle.gridColumn === "auto" ? "auto" : nativeStyle.gridColumn;
        column.style.gridRow = nativeStyle.gridRow;
        column.style.gridArea = nativeStyle.gridArea;
        column.style.order = nativeStyle.order;
        column.style.marginLeft = nativeStyle.marginLeft;
        column.style.marginRight = nativeStyle.marginRight;
        column.style.maxWidth = nativeStyle.maxWidth;
        nativeCardStyle = target.before.style.cssText;
        // Transfer the grid slot to the stack. The original native node and
        // handlers survive, but its old absolute/grid coordinates must not.
        Object.assign(target.before.style, {
          position: "static",
          inset: "auto",
          transform: "none",
          gridArea: "auto",
          width: "100%",
          boxSizing: "border-box",
          margin: "0",
          flex: "0 0 auto",
        });
        target.parent.insertBefore(column, target.before);
        column.append(target.before);
        target = { ...target, parent: column, wrap: false };
      }
      const existing = document.getElementById(IDS.home);
      if (existing) {
        homeRoot = existing;
        target.parent.insertBefore(homeRoot, target.before);
        return;
      }
      homeRoot = document.createElement("div");
      homeRoot.id = IDS.home;
      homeRoot.dataset.mountStrategy = target.strategy;
      homeRoot.dataset.layoutBuild = LAYOUT_BUILD;
      homeRoot.style.cssText =
        "width:100%;min-width:0;box-sizing:border-box;position:relative;display:block;flex:0 0 auto;grid-column:1 / -1;z-index:auto;margin:16px 0 0;";
      if (
        target.strategy === "after-play-full-width" &&
        target.before &&
        getComputedStyle(target.parent).display.includes("grid")
      ) {
        const rowStart = (style: CSSStyleDeclaration) => {
          const value = Number(
            style.gridRowStart ||
              style.gridRow.split("/")[0].trim() ||
              style.gridArea.split("/")[0].trim(),
          );
          return Number.isInteger(value) && value > 0 ? value : null;
        };
        const children = [...target.parent.children].filter(
          (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const playIndex = target.playArea
          ? children.indexOf(target.playArea)
          : -1;
        const following =
          playIndex >= 0 ? children.slice(playIndex + 1) : children;
        const originals = following.map((child) => {
          const properties = ["grid-row-start", "grid-row-end"].map(
            (property) => ({
              property,
              value: child.style.getPropertyValue(property),
              priority: child.style.getPropertyPriority(property),
            }),
          );
          nativeHostStyles.set(child, [
            ...(nativeHostStyles.get(child) ?? []),
            ...properties,
          ]);
          return { child, properties };
        });
        placeGridRows = () => {
          if (!homeRoot || !target?.before) return;
          // Read native CSS again at each breakpoint, without our old row
          // overrides. This avoids repeatedly shifting rows or freezing mobile
          // placement when the sidebar changes from column 2 to column 1.
          for (const { child, properties } of originals)
            for (const { property, value, priority } of properties) {
              if (value) child.style.setProperty(property, value, priority);
              else child.style.removeProperty(property);
            }
          const playStyle = target.playArea
            ? getComputedStyle(target.playArea)
            : null;
          const playStart = playStyle ? (rowStart(playStyle) ?? 1) : 1;
          const start =
            rowStart(getComputedStyle(target.before)) ?? playStart + 1;
          // The reported left column is row:auto; the right is row:2/span 2.
          // Reserve the row after Play even when the left has no numeric row.
          const nativeRows = following.map((child) => {
            const style = getComputedStyle(child);
            return {
              child,
              nativeStart: rowStart(style),
              end: Number(style.gridRowEnd),
            };
          });
          homeRoot.style.gridRow = `${start} / span 1`;
          homeRoot.style.margin = "0";
          for (const { child, nativeStart, end } of nativeRows) {
            if (
              (nativeStart === null && child !== target.before) ||
              (nativeStart !== null && nativeStart < start)
            )
              continue;
            child.style.setProperty(
              "grid-row-start",
              String((nativeStart ?? start) + 1),
              "important",
            );
            if (Number.isInteger(end) && end > (nativeStart ?? start))
              child.style.setProperty(
                "grid-row-end",
                String(end + 1),
                "important",
              );
          }
        };
        placeGridRows();
      }
      if (column) homeRoot.style.marginBottom = "0";
      else if (
        !promotedPlay &&
        getComputedStyle(target.parent).display.includes("flex") &&
        getComputedStyle(target.parent).flexDirection === "column"
      ) {
        flowHost = target.parent;
        originalGap = flowHost.style.getPropertyValue("row-gap");
        originalGapPriority = flowHost.style.getPropertyPriority("row-gap");
        flowHost.style.setProperty("row-gap", "10px");
        homeRoot.style.marginBottom = "0";
      }
      target.parent.insertBefore(homeRoot, target.before);
      handlers.home(homeRoot);
      if (import.meta.env.DEV) {
        const anchors = homepageAnchors(main);
        log("Homepage anchors resolved", {
          recommendedFound: !!anchors.recommended,
          dailyPuzzleFound: !!anchors.puzzle,
          sharedRowFound: target.strategy !== "after-play-area",
          strategy: target.strategy,
        });
      }
      sizeHeatmap();
      if (typeof ResizeObserver !== "undefined") {
        sizing = new ResizeObserver(sizeHeatmap);
        sizing.observe(homeRoot);
        sizing.observe(target.row);
        sizing.observe(target.parent);
        target.cards?.forEach((card) => sizing!.observe(card));
      }
      log("Heatmap mounted", {
        strategy: target.strategy,
        sharedRowFound: target.strategy !== "after-play-area",
        width: Math.round(homeRoot.getBoundingClientRect().width),
      });
    } else if (
      homeRoot.parentElement !== target.parent ||
      homeRoot.nextElementSibling !== target.before
    )
      target.parent.insertBefore(homeRoot, target.before);
    sizeHeatmap();
  };
  function geometry() {
    const h = homeRoot?.getBoundingClientRect(),
      r = target?.cards?.[0]?.getBoundingClientRect();
    const nativeRow = target?.before?.getBoundingClientRect();
    const playRect = target?.playArea?.getBoundingClientRect();
    const host = homeRoot?.parentElement,
      style = host ? getComputedStyle(host) : null;
    const rect = (v: DOMRect) => ({
      left: v.left,
      right: v.right,
      top: v.top,
      bottom: v.bottom,
      width: v.width,
      height: v.height,
    });
    const horizontalAligned =
      !!h &&
      !!r &&
      Math.abs(h.left - r.left) <= 2 &&
      Math.abs(h.right - r.right) <= 2;
    return {
      mounted: !!homeRoot?.isConnected,
      heatmapTop: h?.top,
      heatmapBottom: h?.bottom,
      recommendedTop: r?.top,
      recommendedBottom: r?.bottom,
      heatmapWidth: h?.width,
      recommendedWidth: r?.width,
      heatmap: h
        ? { ...rect(h), position: getComputedStyle(homeRoot!).position }
        : null,
      recommendedMatch: r ? rect(r) : null,
      nativeModule: target?.cards?.[0]
        ? {
            tagName: target.cards[0].tagName,
            className: target.cards[0].className,
          }
        : null,
      horizontalAligned,
      aligned: horizontalAligned,
      nativeRow: nativeRow ? rect(nativeRow) : null,
      playOnline: playRect ? rect(playRect) : null,
      belowPlayOnline: !!h && !!playRect && h.top >= playRect.bottom,
      verticalOverlap: !!h && !!nativeRow && h.bottom + 6 > nativeRow.top,
      host:
        host && style
          ? {
              tagName: host.tagName,
              className: host.className,
              display: style.display,
              position: style.position,
              flexDirection: style.flexDirection,
              gridTemplateColumns: style.gridTemplateColumns,
            }
          : null,
    };
  }
  return {
    update,
    getMountStatus: () => ({
      isHomepage: ["/", "/home"].includes(location.pathname),
      strategy: target?.strategy ?? null,
      recommendedFound: !!homepageAnchors(main).recommended,
      dailyPuzzleFound: !!homepageAnchors(main).puzzle,
      sharedRowFound: !!target && target.strategy !== "after-play-area",
      heatmapMounted: !!document.getElementById(IDS.home),
      width: Math.round(
        document.getElementById(IDS.home)?.getBoundingClientRect().width ?? 0,
      ),
    }),
    getHeatmapGeometry: geometry,
    remountHeatmap: () => {
      remove("home");
      update();
    },
    dispose: () => {
      restore();
      remove("home");
      remove("app");
      document.getElementById(IDS.sidebar)?.remove();
    },
  };
}
