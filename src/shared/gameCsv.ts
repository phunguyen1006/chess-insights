import type { NormalizedGame } from "./types";

function cell(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  const leading = text.match(/^\s*/u)![0];
  const prefix = leading + (text[leading.length] ?? "");
  const controlPrefix = [...prefix].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
  // Spreadsheet programs may execute text even when it is CSV-quoted.
  if (typeof value === "string" && (/^\s*[=+\-@]/u.test(text) || controlPrefix))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function gamesToCsv(games: readonly NormalizedGame[]): string {
  const headers = [
    "Completed UTC",
    "Local date",
    "Username",
    "Opponent",
    "Result",
    "Player color",
    "Player rating",
    "Opponent rating",
    "Time class",
    "Time control",
    "Rated",
    "Termination",
    "ECO",
    "Opening",
    "Variation",
    "Game URL",
  ];
  const sorted = [...games].sort(
    (a, b) => b.endTime - a.endTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const rows = sorted.map((game) =>
    [
      new Date(game.endTime * 1000).toISOString(),
      game.localDate,
      game.username,
      game.opponentUsername,
      game.result,
      game.playerColor,
      game.playerRating,
      game.opponentRating,
      game.timeClass,
      game.timeControl,
      game.rated,
      game.termination,
      game.eco,
      game.openingName,
      game.variation,
      game.url,
    ]
      .map(cell)
      .join(","),
  );
  return `\ufeff${[headers.map(cell).join(","), ...rows].join("\r\n")}\r\n`;
}
