import { IDS } from "./chessDom";
import { sidebarNeedsRepair } from "./sidebarMount";

const ownSurfaces = `.ci-scope,#${IDS.home},#${IDS.app},#${IDS.sidebar}`;

export function observePage(update: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    // Coalesce updates without postponing an existing deadline. Native menus
    // and live UI can mutate continuously while a route is loading.
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      update();
    }, 180);
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some((record) => {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const touchesSidebar =
          !!target?.closest(`#${IDS.sidebar}`) ||
          [...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.id === IDS.sidebar ||
                node.querySelector(`#${IDS.sidebar}`)),
          );
        // Our own insertions remain ignored, but removal or corruption by the
        // native renderer must trigger repair even when only our node changed.
        if (touchesSidebar && sidebarNeedsRepair()) return true;
        // Ignore React's own content mutations, but recover when the native
        // renderer removes an entire mounted surface from an unchanged shell.
        if (
          [...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              !node.isConnected &&
              (node.id === IDS.home ||
                node.id === IDS.app ||
                !!node.querySelector(`#${IDS.home},#${IDS.app}`)),
          )
        )
          return true;
        if (target?.closest(ownSurfaces)) return false;
        return (
          record.type === "attributes" ||
          (record.type === "characterData" &&
            !!target?.closest(
              'nav,[role="navigation"],.nav-component,#sidebar-main-menu',
            )) ||
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element && !node.id.startsWith("chess-insights-"),
          )
        );
      })
    )
      schedule();
  });
  // Watch the stable document root, so replacing <body> does not disconnect
  // menu repair on pages using a different application shell.
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "class",
      "href",
      "role",
      "data-component",
      "data-testid",
      "aria-label",
      "aria-hidden",
      "hidden",
      "title",
      "data-pin",
      "data-primary-action",
      "data-interaction",
      "data-theme",
      "data-game-status",
    ],
  });
  const onClick = (event: Event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('a[href],nav button,[role="navigation"] button')
    )
      schedule();
  };
  for (const name of ["hashchange", "popstate", "pageshow", "resize"])
    window.addEventListener(name, schedule);
  document.addEventListener("click", onClick);
  return {
    schedule,
    dispose: () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      for (const name of ["hashchange", "popstate", "pageshow", "resize"])
        window.removeEventListener(name, schedule);
      document.removeEventListener("click", onClick);
    },
  };
}
