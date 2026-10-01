import { IDS, sidebarTarget } from "./chessDom";
import { readRoute } from "./routing";
export const chartIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M3 19h18v2H3zM5 11h3v6H5zm6-6h3v12h-3zm6 3h3v9h-3z"/></svg>';
export function sidebarComplete(host = document.getElementById(IDS.sidebar)) {
  const link = host?.matches("a.ci-sidebar-link")
    ? host
    : host?.querySelector<HTMLAnchorElement>("a.ci-sidebar-link");
  return !!(
    link?.isConnected &&
    link.getAttribute("href") === "/home#chess-insights/overview" &&
    link.getAttribute("aria-label") === "Insights" &&
    link.querySelector("svg") &&
    link.querySelector("span")?.textContent === "Insights"
  );
}
export function mountSidebar() {
  const target = sidebarTarget();
  if (!target) return;
  const items = [...document.querySelectorAll<HTMLElement>(`#${IDS.sidebar}`)];
  const existing = items.find(
    (item) =>
      sidebarComplete(item) &&
      item.parentElement === target.parent &&
      (target.placement === "after"
        ? target.item.nextElementSibling === item
        : target.item.previousElementSibling === item),
  );
  if (existing) {
    items.filter((item) => item !== existing).forEach((item) => item.remove());
    styleLink(
      existing.matches("a") ? existing : existing.querySelector("a")!,
      target.reference,
    );
    updateActive(existing);
    return;
  }
  items.forEach((item) => item.remove());
  const link = document.createElement("a");
  link.href = "/home#chess-insights/overview";
  link.setAttribute("aria-label", "Insights");
  link.innerHTML = `${chartIcon}<span>Insights</span>`;
  styleLink(link, target.reference);
  let host: HTMLElement = link;
  if (target.item !== target.reference) {
    // Copy one item's layout classes only. Never clone a list or native pin /
    // interaction identity; those can be removed or hidden by Chess.com's UI.
    host = document.createElement(target.item.tagName);
    host.className = `${layoutClasses(target.item)} ci-sidebar-item`;
    host.append(link);
  }
  host.id = IDS.sidebar;
  updateActive(host);
  if (target.placement === "after") target.item.after(host);
  else target.item.before(host);
  link.addEventListener("click", (event) => {
    if (location.pathname === "/home" || location.pathname === "/") {
      event.preventDefault();
      location.hash = "chess-insights/overview";
    }
  });
}
export function sidebarNeedsRepair() {
  const target = sidebarTarget();
  if (!target) return false;
  const item = document.getElementById(IDS.sidebar);
  return (
    !sidebarComplete(item) ||
    item?.parentElement !== target.parent ||
    (target.placement === "after"
      ? target.item.nextElementSibling !== item
      : target.item.previousElementSibling !== item) ||
    document.querySelectorAll(`#${IDS.sidebar}`).length !== 1
  );
}
function layoutClasses(element: HTMLElement) {
  return [...element.classList]
    .filter((name) => !/(?:^|-)(?:active|selected|current|hidden)$/.test(name))
    .join(" ");
}
function styleLink(link: HTMLElement, reference: HTMLElement) {
  link.className = `${layoutClasses(reference)} ci-sidebar-link`;
  const label = link.querySelector<HTMLElement>("span");
  const nativeLabel = reference.querySelector<HTMLElement>(
    ".sidebar-link-text,.nav-link-text",
  );
  if (label) label.className = nativeLabel ? layoutClasses(nativeLabel) : "";
  const native = getComputedStyle(reference);
  for (const key of [
    "font-size",
    "font-weight",
    "padding",
    "min-height",
    "gap",
    "border-radius",
  ])
    link.style.setProperty(key, native.getPropertyValue(key));
}
function updateActive(host: HTMLElement) {
  const link = host.matches("a") ? host : host.querySelector("a");
  if (!link) return;
  if (["/", "/home"].includes(location.pathname) && readRoute())
    link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
}
