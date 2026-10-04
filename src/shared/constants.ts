export const DB_NAME = "chess-insights-db";
export const DB_VERSION = 4;
export const SETTINGS_KEY = "chessInsights.settings";
export const CURRENT_MONTH_TTL = 5 * 60_000;
export const MANUAL_REFRESH_COOLDOWN = 30_000;
export const INDEX_TTL = 60 * 60_000;
export const MIN_OPENING_SAMPLE = 10;
export const MIN_OPPONENT_SAMPLE = 5;
export const POOLS = ["rapid", "blitz", "bullet", "daily"] as const;
export const SECTIONS = [
  "overview",
  "life-review",
  "activity",
  "rating",
  "openings",
  "opponents",
  "results",
  "time",
  "mistakes",
] as const;
export type Section = (typeof SECTIONS)[number];
