import { getMain, IDS } from "./chessDom";
import { version } from "../../../package.json";

export const LAYOUT_BUILD = version;
let original: unknown = null;
const labels =
  /^(?:play online|play bots|play coach|play a friend|recommended match|daily puzzle|game history)$/i;

function snapshot() {
  const main = getMain();
  const nodes: unknown[] = [];
  const walk = (element: Element, parent: number, depth: number) => {
    if (depth > 18 || nodes.length >= 1800) return;
    if (
      element.closest(
        ".ci-scope,#chess-insights-sidebar-item,#chess-insights-app",
      )
    )
      return;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const index = nodes.length;
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    nodes.push({
      parent,
      tag: element.tagName,
      id: element.id,
      class: element.getAttribute("class"),
      label: text.length < 40 && labels.test(text) ? text : undefined,
      rect: [rect.x, rect.y, rect.width, rect.height],
      layout: {
        display: style.display,
        position: style.position,
        gridArea: style.gridArea,
        gridRows: style.gridTemplateRows,
        gridColumns: style.gridTemplateColumns,
        order: style.order,
        height: style.height,
        minHeight: style.minHeight,
        gap: style.gap,
        margin: style.margin,
        transform: style.transform,
      },
    });
    for (const child of element.children) walk(child, index, depth + 1);
  };
  if (main) walk(main, -1, 0);
  return {
    viewport: [innerWidth, innerHeight],
    scrollY,
    zoom: devicePixelRatio,
    nodes,
  };
}

export function captureOriginalLayout() {
  original = snapshot();
}

export function downloadLayoutReport() {
  const root = document.getElementById(IDS.home);
  const data = {
    build: LAYOUT_BUILD,
    strategy: root?.dataset.mountStrategy,
    original,
    current: snapshot(),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `chess-insights-layout-${version}.json`;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
