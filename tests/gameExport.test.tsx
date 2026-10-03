// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameExport } from "../src/features/insights/components/GameExport";
import { gamesToCsv } from "../src/shared/gameCsv";
import { downloadText } from "../src/shared/download";
import type { NormalizedGame } from "../src/shared/types";

const game = (patch: Partial<NormalizedGame> = {}): NormalizedGame => ({
  id: "game-1",
  url: "https://www.chess.com/game/live/42",
  username: "alice",
  endTime: Date.parse("2026-10-03T00:00:00Z") / 1000,
  localDate: "2026-10-03",
  timeClass: "rapid",
  timeControl: "600+5",
  rated: true,
  rules: "chess",
  playerColor: "white",
  result: "win",
  rawPlayerResult: "win",
  rawOpponentResult: "resigned",
  termination: "Resignation",
  playerRating: 1500,
  opponentRating: 1520,
  opponentUsername: "bob",
  whiteUsername: "alice",
  blackUsername: "bob",
  whiteRating: 1500,
  blackRating: 1520,
  eco: "B90",
  openingName: "Sicilian Defense",
  variation: null,
  pgn: "Must not be exported",
  ...patch,
});

// Read CSV records, including quoted commas, escaped quotes and embedded newlines.
function records(csv: string): string[][] {
  const text = csv.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" && text[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += character;
  }
  if (row.length || field) rows.push([...row, field]);
  expect(quoted).toBe(false);
  return rows;
}

it("round-trips UTF-8, commas, quotes and newlines while retaining empty and zero numeric cells", () => {
  const csv = gamesToCsv([
    game({
      opponentUsername: 'Bób, "the rook"',
      openingName: 'Sicilian, "Najdorf"\nDéfense ♞',
      playerRating: null,
      opponentRating: 0,
      variation: "",
      rated: false,
    }),
  ]);
  expect(csv.startsWith("\ufeff")).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  const [header, row] = records(csv);
  expect(header).toHaveLength(16);
  expect(row).toEqual([
    "2026-10-03T00:00:00.000Z",
    "2026-10-03",
    "alice",
    'Bób, "the rook"',
    "win",
    "white",
    "",
    "0",
    "rapid",
    "600+5",
    "false",
    "Resignation",
    "B90",
    'Sicilian, "Najdorf"\nDéfense ♞',
    "",
    "https://www.chess.com/game/live/42",
  ]);
  expect(csv).not.toContain("Must not be exported");
});

it.each([
  "=SUM(1,2)",
  "+SUM(1,2)",
  "-SUM(1,2)",
  "@SUM(1,2)",
  "  =SUM(1,2)",
  "\t=SUM(1,2)",
  "  \r\nAlice",
  "\u0000Alice",
  "\u007fAlice",
  "\u0080Alice",
])(
  "neutralizes spreadsheet formula/control prefix %j even when quoted",
  (value) => {
    const [, row] = records(gamesToCsv([game({ opponentUsername: value })]));
    expect(row[3]).toBe(`'${value}`);
  },
);

it("sorts latest first with a deterministic ID tie break without changing its inputs", () => {
  const input = Object.freeze([
    Object.freeze(game({ id: "old", endTime: 10 })),
    Object.freeze(game({ id: "b", endTime: 20, opponentUsername: "second" })),
    Object.freeze(game({ id: "a", endTime: 20, opponentUsername: "first" })),
  ]);
  const output = records(gamesToCsv(input)).slice(1);
  expect(output.map((row) => row[3])).toEqual(["first", "second", "bob"]);
  expect(input.map((entry) => entry.id)).toEqual(["old", "b", "a"]);
  expect(records(gamesToCsv([]))).toHaveLength(1);
});

let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
const objectUrl = vi.fn((_blob: Blob) => "blob:games-csv");
const revokeUrl = vi.fn();
const clicks: { name: string; href: string }[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Blob", NodeBlob);
  const NativeURL = globalThis.URL;
  vi.stubGlobal(
    "URL",
    Object.assign(class extends NativeURL {}, {
      createObjectURL: objectUrl,
      revokeObjectURL: revokeUrl,
    }),
  );
  objectUrl.mockReset().mockReturnValue("blob:games-csv");
  revokeUrl.mockReset();
  clicks.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    function (this: HTMLAnchorElement) {
      clicks.push({ name: this.download, href: this.href });
    },
  );
  container = document.createElement("div");
  container.className = "ci-scope";
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  await vi.runAllTimersAsync();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const button = () => container.querySelector<HTMLButtonElement>("button")!;
const finishPreparation = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

it("exports only the filtered games passed at click time, reports busy/status, and cleans up the download", async () => {
  const included = game({ opponentUsername: "visible-opponent" });
  await act(() =>
    root.render(
      <GameExport username="alice" games={[included]} loading={false} />,
    ),
  );
  expect(button().textContent).toBe("Export games CSV (1)");
  await act(() => {
    button().click();
    button().click();
  });
  expect(button().disabled).toBe(true);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(objectUrl).not.toHaveBeenCalled();
  await finishPreparation();
  expect(objectUrl).toHaveBeenCalledOnce();
  const blob = objectUrl.mock.calls[0][0];
  expect(blob.type).toBe("text/csv;charset=utf-8");
  expect(new Uint8Array(await blob.arrayBuffer()).slice(0, 3)).toEqual(
    new Uint8Array([239, 187, 191]),
  );
  const exported = records(await blob.text());
  expect(exported).toHaveLength(2);
  expect(exported[1][3]).toBe("visible-opponent");
  expect(clicks).toEqual([
    {
      name: expect.stringMatching(
        /^chess-insights-alice-games-\d{4}-\d{2}-\d{2}\.csv$/,
      ),
      href: "blob:games-csv",
    },
  ]);
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    "Download started for 1 game.",
  );
  expect(button().disabled).toBe(false);
  expect(document.querySelector("a[download]")).toBeNull();
  expect(revokeUrl).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(revokeUrl).toHaveBeenCalledWith("blob:games-csv");
});

it("disables empty and syncing exports and cancels deferred data after an account/filter switch", async () => {
  await act(() =>
    root.render(<GameExport username="alice" games={[]} loading={false} />),
  );
  expect(button().disabled).toBe(true);
  await act(() =>
    root.render(
      <GameExport username="alice" games={[game()]} loading={true} />,
    ),
  );
  expect(button().disabled).toBe(true);
  expect(container.textContent).toContain("Available after sync.");
  await act(() =>
    root.render(
      <GameExport username="alice" games={[game()]} loading={false} />,
    ),
  );
  await act(() => button().click());
  await act(() =>
    root.render(
      <GameExport
        username="bob"
        games={[game({ username: "bob" })]}
        loading={false}
      />,
    ),
  );
  await finishPreparation();
  expect(objectUrl).not.toHaveBeenCalled();
  expect(button().disabled).toBe(false);
  await act(() => button().click());
  await finishPreparation();
  expect(clicks[0].name).toContain("-bob-");
  expect(records(await objectUrl.mock.calls[0][0].text())[1][2]).toBe("bob");
});

it("shows a failed download inline and permits retry without leaving an anchor or URL behind", async () => {
  const click = vi.mocked(HTMLAnchorElement.prototype.click);
  click.mockImplementationOnce(() => {
    throw new Error("Download unavailable");
  });
  await act(() =>
    root.render(
      <GameExport username="alice" games={[game()]} loading={false} />,
    ),
  );
  await act(() => button().click());
  await finishPreparation();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Download unavailable",
  );
  expect(button().disabled).toBe(false);
  expect(document.querySelector("a[download]")).toBeNull();
  await vi.advanceTimersByTimeAsync(1000);
  expect(revokeUrl).toHaveBeenCalledOnce();
  await act(() => button().click());
  await finishPreparation();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(clicks).toHaveLength(1);
});

it("releases the object URL after an anchor fails independently of React", async () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
    throw new Error("blocked");
  });
  expect(() => downloadText("games.csv", "csv", "text/csv")).toThrow("blocked");
  expect(document.querySelector("a[download]")).toBeNull();
  expect(revokeUrl).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(revokeUrl).toHaveBeenCalledWith("blob:games-csv");
});
