import type { Request } from "./types";

// TypeScript types are not a runtime boundary for chrome.runtime messages.
export function validRequest(value: unknown): value is Request {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  const username = (name: unknown) =>
    typeof name === "string" && /^[a-zA-Z0-9_-]{2,30}$/.test(name);
  const optionalBoolean = (key: string) =>
    m[key] === undefined || typeof m[key] === "boolean";
  switch (m.type) {
    case "ci:settings":
      return true;
    case "ci:theme-setting":
      return m.theme === "light" || m.theme === "dark";
    case "ci:puzzle-setting":
      return typeof m.enabled === "boolean";
    case "ci:puzzle-save": {
      if (
        !m.attempt ||
        typeof m.attempt !== "object" ||
        Array.isArray(m.attempt)
      )
        return false;
      const a = m.attempt as Record<string, unknown>;
      return (
        username(a.username) &&
        typeof a.id === "string" &&
        !!a.id &&
        typeof a.attemptedAt === "number" &&
        Number.isFinite(a.attemptedAt) &&
        ["solved", "failed", "unknown"].includes(a.result as string) &&
        ["ratingBefore", "ratingAfter", "ratingChange", "puzzleRating"].every(
          (key) =>
            a[key] === null ||
            (typeof a[key] === "number" && Number.isFinite(a[key])),
        )
      );
    }
    case "ci:engine-claim":
    case "ci:engine-guard":
    case "ci:engine-release":
      return typeof m.token === "string" && !!m.token;
    case "ci:connect":
    case "ci:snapshot":
    case "ci:puzzles":
    case "ci:puzzle-start":
    case "ci:puzzle-clear":
    case "ci:puzzle-export":
    case "ci:engine-open":
    case "ci:engine-stop":
    case "ci:engine-status":
    case "ci:engine-test":
    case "ci:replay-test":
      return username(m.username);
    case "ci:puzzle-import":
      return username(m.username) && typeof m.text === "string";
    case "ci:durations":
      return (
        username(m.username) && (m.action === "cache" || m.action === "analyze")
      );
    case "ci:sync":
      return (
        username(m.username) &&
        optionalBoolean("force") &&
        Array.isArray(m.years) &&
        m.years.length <= 30 &&
        m.years.every(
          (y) =>
            typeof y === "number" &&
            Number.isInteger(y) &&
            y >= 2000 &&
            y <= new Date().getFullYear() + 1,
        )
      );
    case "ci:analysis": {
      if (
        !username(m.username) ||
        ![
          "state",
          "selection",
          "clocks",
          "enqueue",
          "pause",
          "cancel",
          "review",
        ].includes(m.action as string) ||
        !["force", "includeClocks", "includeSelection"].every(
          optionalBoolean,
        ) ||
        (m.scope !== undefined && m.scope !== "unanalyzed") ||
        (m.ids !== undefined &&
          (!Array.isArray(m.ids) ||
            !m.ids.every((id) => typeof id === "string")))
      )
        return false;
      return (
        m.action !== "review" ||
        (typeof m.mistakeId === "string" &&
          !!m.mistakeId &&
          ["Again", "Hard", "Good", "Easy"].includes(m.grade as string) &&
          typeof m.correct === "boolean")
      );
    }
    default:
      return false;
  }
}
