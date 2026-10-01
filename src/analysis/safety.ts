export function historicalInsightsUrl(url: string) {
  try {
    const u = new URL(url);
    return (
      u.origin === "https://www.chess.com" &&
      ["/", "/home", "/home/"].includes(u.pathname) &&
      /^#chess-insights\/mistakes(?:\?|$)/.test(u.hash)
    );
  } catch {
    return false;
  }
}
export function liveContext() {
  return (
    /^\/(game|live|play)(\/|$)/.test(location.pathname) ||
    !!document.querySelector(
      '[data-game-status="in_progress"],[data-game-status="active"],.live-game,.clock-player-turn',
    )
  );
}
