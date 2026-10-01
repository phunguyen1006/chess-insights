// Development-only completion metadata, never chess positions or puzzle solutions.
export function installPuzzleFixture() {
  let puzzle = 1;
  const controls = document.createElement("div");
  controls.style.cssText =
    "position:fixed;bottom:8px;left:8px;z-index:999999;background:white;padding:8px;border:1px solid #aaa;display:flex;gap:6px;flex-wrap:wrap";
  controls.setAttribute("aria-label", "Puzzle development controls");
  controls.innerHTML =
    '<button data-action="rated">Fixture Rated Puzzle</button><button data-action="solved">Fixture Solved</button><button data-action="failed">Fixture Failed</button><button data-action="next">Fixture Next Puzzle</button><button data-action="home">Fixture Home</button>';
  const root = document.createElement("section");
  root.id = "board-layout-sidebar";
  root.setAttribute("data-puzzle-mode", "rated");
  root.style.cssText =
    "background:white;padding:24px;margin:20px 100px;min-height:200px";
  root.innerHTML =
    '<h1>Rated Puzzle Fixture</h1><div class="rated-sidebar-component"><span data-puzzle-id="fixture-1"></span><div role="status">Puzzle active</div><div data-player-rating>1500</div></div>';
  root.hidden = true;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  controls.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).getAttribute("data-action");
    if (action === "rated" || action === "home") {
      root.hidden = action === "home";
      history.pushState(
        null,
        "",
        `${action === "home" ? "/home" : "/puzzles/rated"}?puzzles=fixture`,
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else if (action === "next") {
      puzzle++;
      root
        .querySelector("[data-puzzle-id]")!
        .setAttribute("data-puzzle-id", `fixture-${puzzle}`);
      status.removeAttribute("data-puzzle-result");
      status.textContent = "Puzzle active";
    } else if (action === "solved" || action === "failed") {
      status.setAttribute("data-puzzle-result", action);
      status.textContent = `Puzzle ${action}`;
    }
  });
  document.body.append(root, controls);
}
