import { useMemo, useState } from "react";
import { downloadText } from "../../../shared/download";
import { Empty, number } from "./Common";
import { Trend } from "./Charts";
import {
  ChessSection,
  formatDuration,
  percentage,
  ratingDelta,
  StatSummaryRow,
  WdlBar,
} from "./NativeStats";

export interface WeekHourCell {
  /** Monday = 0. Hours are local completion hours, not inferred start times. */
  weekday: number;
  hour: number;
  games: number;
  seconds: number | null;
  knownDurations: number;
}
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function WeekHourMatrix({
  cells,
  metric,
}: {
  cells: WeekHourCell[];
  metric: "games" | "time";
}) {
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const prepared = useMemo(() => {
    const slots = Array.from({ length: 168 }, (_, index) => ({
      weekday: Math.floor(index / 24),
      hour: index % 24,
      games: 0,
      seconds: 0,
      knownDurations: 0,
    }));
    for (const cell of cells) {
      if (
        !Number.isInteger(cell.weekday) ||
        !Number.isInteger(cell.hour) ||
        cell.weekday < 0 ||
        cell.weekday > 6 ||
        cell.hour < 0 ||
        cell.hour > 23
      )
        continue;
      const slot = slots[cell.weekday * 24 + cell.hour];
      slot.games += Math.max(0, Number.isFinite(cell.games) ? cell.games : 0);
      slot.seconds += Math.max(
        0,
        cell.seconds !== null && Number.isFinite(cell.seconds)
          ? cell.seconds
          : 0,
      );
      slot.knownDurations += Math.max(
        0,
        Number.isFinite(cell.knownDurations) ? cell.knownDurations : 0,
      );
    }
    const positives = slots
      .map((cell) => (metric === "games" ? cell.games : cell.seconds))
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    const thresholds = [0.25, 0.5, 0.75].map(
      (fraction) => positives[Math.floor((positives.length - 1) * fraction)],
    );
    return { slots, thresholds };
  }, [cells, metric]);
  const details = (cell: WeekHourCell) => {
    const coverage = Math.min(cell.games, cell.knownDurations);
    const duration = !cell.games
      ? "No games in this slot"
      : coverage
        ? `${formatDuration(cell.seconds)} recorded play time · ${number(coverage)}/${number(cell.games)} games with duration`
        : "Duration unavailable";
    return `${weekdays[cell.weekday]}, ${clock(cell.hour)}–${clock(cell.hour + 1)}: ${number(cell.games)} games · ${duration}`;
  };
  return (
    <div className="ci-life-hour-matrix">
      <p className="ci-note">
        Local completion day and hour ·{" "}
        {metric === "games" ? "Games" : "Recorded play time"}
      </p>
      <div
        className="ci-life-matrix-scroll"
        tabIndex={0}
        role="region"
        aria-label="Weekday and hour activity. Scroll horizontally to see all hours."
      >
        <div className="ci-life-matrix-grid">
          <span aria-hidden="true" />
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              className="ci-life-hour-label"
              key={`hour-${hour}`}
              aria-hidden="true"
            >
              {String(hour).padStart(2, "0")}
            </span>
          ))}
          {weekdays.flatMap((weekday, day) => [
            <span
              className="ci-life-hour-label"
              key={weekday}
              aria-hidden="true"
            >
              {weekday.slice(0, 3)}
            </span>,
            ...prepared.slots.slice(day * 24, day * 24 + 24).map((cell) => {
              const value = metric === "games" ? cell.games : cell.seconds;
              const unknown =
                metric === "time" && cell.games > 0 && !cell.knownDurations;
              const level = !value
                ? 0
                : 1 +
                  prepared.thresholds.filter((threshold) => value > threshold)
                    .length;
              const text = details(cell);
              return (
                <button
                  type="button"
                  key={`${day}:${cell.hour}`}
                  className={`ci-life-hour-cell ci-level-${level}${unknown ? " ci-duration-unknown" : ""}`}
                  aria-label={text}
                  title={text}
                  onFocus={() => setActiveCell(day * 24 + cell.hour)}
                  onBlur={() => setActiveCell(null)}
                  onMouseEnter={() => setActiveCell(day * 24 + cell.hour)}
                  onMouseLeave={() => setActiveCell(null)}
                  onClick={() => setActiveCell(day * 24 + cell.hour)}
                />
              );
            }),
          ])}
        </div>
      </div>
      <p className="ci-chart-readout" role="status" aria-live="polite">
        {activeCell === null
          ? "Focus or select a cell for game count and recorded time."
          : details(prepared.slots[activeCell])}
      </p>
      <p className="ci-note">
        Lighter to darker green means less to more activity within this period.
        {metric === "time" &&
          " Striped cells have games but no recorded duration."}
      </p>
    </div>
  );
}

export interface LifeReviewShareProps {
  username: string;
  period: string;
  headline: string;
  games: number;
  /** Percentage, between zero and 100. */
  winRate: number | null;
  observedChange: number | null;
  pool: string;
  timeSeconds: number | null;
  activeDays: number;
  opening: string | null;
  coverage?: string;
  theme?: "light" | "dark";
}

function escapeXml(value: string): string {
  // XML 1.0 cannot contain these characters, even after entity escaping.
  return Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        (code >= 0x10000 && code <= 0x10ffff)
      );
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function wrapped(value: string, maxCharacters: number): string[] {
  const words = value
    .trim()
    .split(/\s+/u)
    .flatMap((word) => {
      // A single long label must not overflow the exported image.
      const characters = Array.from(word);
      return Array.from(
        { length: Math.ceil(characters.length / maxCharacters) },
        (_, i) =>
          characters.slice(i * maxCharacters, (i + 1) * maxCharacters).join(""),
      );
    });
  const lines: string[] = [];
  for (const word of words) {
    const previous = lines.at(-1);
    if (previous && Array.from(`${previous} ${word}`).length <= maxCharacters)
      lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines.length ? lines : ["—"];
}

/** Standalone vector image: no scripts, links, embedded HTML or remote assets. */
export function lifeReviewShareSvg(props: LifeReviewShareProps): string {
  const dark = props.theme === "dark";
  const palette = dark
    ? {
        card: "#262421",
        text: "#f1f0ed",
        muted: "#bbb8b2",
        border: "#4b4843",
        green: "#b4db8d",
      }
    : {
        card: "#ffffff",
        text: "#262522",
        muted: "#6b6864",
        border: "#e3e1dc",
        green: "#456e29",
      };
  const text = (
    value: string,
    x: number,
    y: number,
    size = 16,
    color = palette.text,
    bold = false,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}"${bold ? ' font-weight="700"' : ""}>${escapeXml(value)}</text>`;
  const blocks: string[] = [];
  let y = 40;
  blocks.push(
    text("Chess Insights · Life Review", 32, y, 18, palette.green, true),
  );
  y += 32;
  for (const line of wrapped(`${props.username} · ${props.period}`, 74)) {
    blocks.push(text(line, 32, y, 16, palette.muted));
    y += 24;
  }
  y += 12;
  for (const line of wrapped(props.headline, 60)) {
    blocks.push(text(line, 32, y, 20, palette.text, true));
    y += 28;
  }
  y += 16;
  blocks.push(
    `<line x1="32" x2="768" y1="${y}" y2="${y}" stroke="${palette.border}"/>`,
  );
  const metrics = [
    ["Games", number(props.games)],
    ["Win rate", percentage(props.winRate)],
    ["Active days", number(props.activeDays)],
    [`Observed ${props.pool} change`, ratingDelta(props.observedChange)],
    ["Recorded play time", formatDuration(props.timeSeconds)],
  ];
  y += 32;
  for (const [label, value] of metrics) {
    blocks.push(text(label, 32, y, 16, palette.muted));
    blocks.push(text(value, 560, y, 18, palette.text, true));
    y += 32;
  }
  if (props.opening) {
    y += 10;
    blocks.push(text("Most played opening", 32, y, 14, palette.muted));
    y += 25;
    for (const line of wrapped(props.opening, 75)) {
      blocks.push(text(line, 32, y));
      y += 24;
    }
  }
  y += 16;
  for (const line of wrapped(
    props.coverage ??
      "Cached completed games. Recorded time may have incomplete coverage.",
    88,
  )) {
    blocks.push(text(line, 32, y, 13, palette.muted));
    y += 20;
  }
  for (const line of wrapped(
    "Rating change compares observations within one pool, not guaranteed post-game ratings.",
    88,
  )) {
    blocks.push(text(line, 32, y, 13, palette.muted));
    y += 20;
  }
  const height = y + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img" aria-labelledby="title"><title id="title">${escapeXml(`${props.username}: ${props.period} Life Review`)}</title><rect width="800" height="${height}" rx="4" fill="${palette.card}"/><g font-family="Arial, sans-serif">${blocks.join("")}</g></svg>`;
}

export function LifeReviewShareCard(props: LifeReviewShareProps) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  return (
    <ChessSection title="Share your Life Review">
      <article className="ci-life-share" aria-label="Life Review summary card">
        <p className="ci-note">
          {props.username} · {props.period}
        </p>
        <h4>{props.headline}</h4>
        <StatSummaryRow
          items={[
            ["Games", props.games],
            ["Win rate", percentage(props.winRate)],
            ["Active days", props.activeDays],
          ]}
        />
        <StatSummaryRow
          items={[
            [
              `Observed ${props.pool} change`,
              ratingDelta(props.observedChange),
            ],
            ["Recorded play time", formatDuration(props.timeSeconds)],
            ["Most played opening", props.opening ?? "Unavailable"],
          ]}
        />
        <p className="ci-note">
          {props.coverage ??
            "Cached completed games. Recorded time may have incomplete coverage."}
        </p>
        <p className="ci-note">
          Rating change compares observations within one pool, not guaranteed
          post-game ratings.
        </p>
      </article>
      <button
        type="button"
        onClick={(event) => {
          setError("");
          setStatus("");
          try {
            const theme =
              props.theme ??
              (event.currentTarget
                .closest("[data-ci-theme]")
                ?.getAttribute("data-ci-theme") === "dark"
                ? "dark"
                : "light");
            const account =
              props.username.replace(/[^a-z0-9_-]/gi, "_") || "account";
            downloadText(
              `chess-insights-${account}-life-review.svg`,
              lifeReviewShareSvg({ ...props, theme }),
              "image/svg+xml;charset=utf-8",
            );
            setStatus("Summary card download started (SVG image).");
          } catch (reason) {
            setError(
              `Could not export the summary card. ${reason instanceof Error ? reason.message : "Please try again."}`,
            );
          }
        }}
      >
        Export summary card
      </button>
      {error ? (
        <p className="ci-status" role="alert">
          {error}
        </p>
      ) : (
        <p className="ci-note" role="status">
          {status}
        </p>
      )}
    </ChessSection>
  );
}

interface Results {
  wins: number;
  draws: number;
  losses: number;
}
export function ResultComparison({
  current,
  previous,
  currentLabel,
  previousLabel = "Previous period",
}: {
  current: Results;
  previous?: Results | null;
  currentLabel: string;
  previousLabel?: string;
}) {
  const rows = [{ values: current, label: currentLabel }];
  if (previous) rows.push({ values: previous, label: previousLabel });
  return (
    <div className="ci-life-results">
      <p className="ci-note">Wins (green) · Draws (gray) · Losses (red)</p>
      {rows.map(({ values, label }, index) => {
        const total = values.wins + values.draws + values.losses;
        return (
          <div className="ci-life-result-row" key={index}>
            <div className="ci-row">
              <strong>{label}</strong>
              <span>{number(total)} games</span>
            </div>
            {total ? (
              <WdlBar {...values} label={label} />
            ) : (
              <Empty>No completed games in this period.</Empty>
            )}
            <p className="ci-note">
              {(
                [
                  ["Wins", values.wins],
                  ["Draws", values.draws],
                  ["Losses", values.losses],
                ] as const
              )
                .map(
                  ([name, count]) =>
                    `${number(count)} ${name.toLowerCase()} (${percentage(total ? (count / total) * 100 : null)})`,
                )
                .join(" · ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export interface TimelineSession {
  id: string;
  startTimestamp: number;
  endTimestamp: number;
  games: number;
  spanSeconds?: number;
  /** Existing sessionAnalytics durationSeconds is the span including breaks. */
  durationSeconds?: number;
  recordedSeconds?: number;
}
export function SessionTimeline({
  sessions,
  limit = 180,
}: {
  sessions: TimelineSession[];
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const chronological = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          a.startTimestamp - b.startTimestamp || a.id.localeCompare(b.id),
      ),
    [sessions],
  );
  const cap = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 180));
  const selected = expanded ? chronological : chronological.slice(-cap);
  if (!selected.length)
    return (
      <Empty>
        No sessions with reliable start and end times in this period.
      </Empty>
    );
  return (
    <div className="ci-life-session-timeline">
      <Trend
        label="Session timeline: session span in minutes"
        data={selected.map((session) => {
          const span =
            session.spanSeconds ??
            session.durationSeconds ??
            (session.endTimestamp - session.startTimestamp) / 1000;
          return {
            position: session.startTimestamp,
            label: new Date(session.startTimestamp).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric", year: "numeric" },
            ),
            value: span / 60,
            detail: `${new Date(session.startTimestamp).toLocaleString()}–${new Date(session.endTimestamp).toLocaleString()} · ${number(session.games)} games · ${formatDuration(span)} session span${session.recordedSeconds !== undefined ? ` · ${formatDuration(session.recordedSeconds)} recorded play time` : ""}`,
          };
        })}
      />
      <p className="ci-note">
        Vertical axis: minutes. Session span includes breaks between games.{" "}
        {selected.length < chronological.length &&
          `Showing the latest ${number(selected.length)} of ${number(chronological.length)} sessions.`}
      </p>
      {!expanded && selected.length < chronological.length && (
        <button type="button" onClick={() => setExpanded(true)}>
          Show all sessions
        </button>
      )}
    </div>
  );
}
