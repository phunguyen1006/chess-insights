import { SECTIONS } from "../../shared/constants";
import type { Section } from "../../shared/constants";
export function readRoute(
  hash = location.hash,
): { section: Section; date: string; termination?: string } | null {
  const match = hash.match(/^#chess-insights(?:\/([a-z-]+))?(?:\?([^#]+))?$/);
  if (!match) return null;
  const section = SECTIONS.includes(match[1] as Section)
    ? (match[1] as Section)
    : "overview";
  const params = new URLSearchParams(match[2] ?? "");
  const date = params.get("date") ?? "";
  return {
    section,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    ...(params.get("termination") === "Timeout"
      ? { termination: "Timeout" }
      : {}),
  };
}
export function openInsights(section: Section = "overview", date = "") {
  location.hash = `chess-insights/${section}${date ? `?date=${encodeURIComponent(date)}` : ""}`;
}
