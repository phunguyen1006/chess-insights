// Simulates a native menu reconciliation after the initial route update.
// Development-only: production content never imports this module.
export function installNavigationFixture(modern = false) {
  const nav = document.querySelector<HTMLElement>(".fixture-sidebar")!;
  const main = document.querySelector<HTMLElement>("main")!;
  const home = [...main.childNodes];
  const homeLink = document.createElement("a");
  homeLink.href = "/home";
  homeLink.textContent = "Home";
  nav.querySelector(".brand")!.append(homeLink);
  const nativeMenu = () => {
    if (!modern) return;
    nav.id = "sidebar-main-menu";
    nav.classList.add("sidebar-container");
    nav.querySelector(".sidebar-pinned-tabs-wrapper")?.remove();
    [...nav.children]
      .filter((child) => child.matches("a"))
      .forEach((child) => child.remove());
    const wrapper = document.createElement("div");
    wrapper.className = "sidebar-pinned-tabs-wrapper";
    const favorites = document.createElement("div");
    favorites.id = "favorited-tabs";
    const unfavorited = document.createElement("div");
    unfavorited.className = "sidebar-unfavorited-tabs";
    const rest = document.createElement("div");
    rest.id = "unfavorited-tabs";
    const includeStats =
      new URLSearchParams(location.search).get("stats") !== "absent";
    for (const [kind, name] of [
      ["play", "Play"],
      ["puzzles", "Puzzles"],
      ...(includeStats ? [["stats", "Stats"]] : [["learn", "Learn"]]),
      ["train", "Train"],
      ["watch", "Watch"],
      ["community", "Community"],
      ["other", "Other"],
    ]) {
      const item = document.createElement("div");
      item.dataset.pin = kind;
      const desktop = document.createElement("div");
      desktop.className = "sidebar-link-desktop-wrapper sidebar-mobile-hidden";
      // The Train shell additionally exercises a button-based Stats control.
      const control = document.createElement(
        kind === "stats" && location.pathname === "/train" ? "button" : "a",
      );
      control.className = "sidebar-link";
      control.setAttribute("aria-label", name);
      control.innerHTML = `<span class="sidebar-link-text">${name}</span>`;
      if (control instanceof HTMLAnchorElement) control.href = `/${kind}`;
      else control.dataset.fixturePath = `/${kind}`;
      desktop.append(control);
      const mobile = document.createElement("div");
      mobile.className = "sidebar-link-mobile-wrapper sidebar-desktop-hidden";
      mobile.dataset.primaryAction = `/${kind}`;
      const button = document.createElement("button");
      button.className = "sidebar-link sidebar-desktop-hidden";
      button.dataset.fixturePath = `/${kind}`;
      button.innerHTML = `<span class="sidebar-link-text">${name}</span>`;
      mobile.append(button);
      item.append(desktop, mobile);
      (["play", "puzzles", "stats", "learn"].includes(kind)
        ? favorites
        : rest
      ).append(item);
    }
    unfavorited.append(rest);
    wrapper.append(favorites, unfavorited);
    nav.querySelector("[data-user-menu]")!.before(wrapper);
  };
  const renderPage = (path: string, title: string) => {
    if (path === "/home") main.replaceChildren(...home);
    else {
      const section = document.createElement("section");
      section.className = "fixture-native-panel";
      const heading = document.createElement("h1");
      heading.textContent = `${title} · Native page fixture`;
      const text = document.createElement("p");
      text.textContent =
        "The native menu reconciles 450ms after navigation and removes injected items.";
      section.append(heading, text);
      main.replaceChildren(section);
    }
  };
  if (modern) {
    const style = document.createElement("style");
    style.textContent = `
      .fixture-sidebar button.sidebar-link { width:100%;border:0;background:none;color:inherit;text-align:left;display:flex;align-items:center;gap:12px;padding:10px 18px;font:600 14px system-ui;min-height:44px;box-sizing:border-box; }
      .fixture-sidebar .sidebar-desktop-hidden { display:none!important; }
      @media(max-width:700px) { .fixture-sidebar .sidebar-mobile-hidden { display:none!important; } .fixture-sidebar .sidebar-desktop-hidden { display:block!important; } }
    `;
    document.head.append(style);
    nativeMenu();
    renderPage(
      location.pathname,
      location.pathname === "/watch" ? "Watch" : "Train",
    );
  }
  let reconciliation: ReturnType<typeof setTimeout> | undefined;
  nav.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLElement>(
      "a[href],button[data-fixture-path]",
    );
    if (!link || link.closest("#chess-insights-sidebar-item")) return;
    const path =
      link instanceof HTMLAnchorElement
        ? new URL(link.href).pathname
        : link.dataset.fixturePath!;
    if (
      !["/home", "/train", "/training", "/watch", "/community"].includes(path)
    )
      return;
    event.preventDefault();
    if (reconciliation) clearTimeout(reconciliation);
    history.pushState(null, "", `${path}${location.search}`);
    nativeMenu();
    renderPage(path, link.textContent?.trim() ?? path);
    reconciliation = setTimeout(() => {
      document.getElementById("chess-insights-sidebar-item")?.remove();
    }, 450);
  });
}
