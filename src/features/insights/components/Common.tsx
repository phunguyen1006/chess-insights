import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import type { Filters, NormalizedGame } from "../../../shared/types";
import { POOLS } from "../../../shared/constants";
import { localDate, displayDate } from "../../../shared/dates";
import { observedDeltas } from "../../../analytics/ratings";
export const number = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
export const signed = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${number(n)}`;
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ci-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function Stats({
  items,
  actions = {},
}: {
  items: [string, string | number | null][];
  actions?: Record<string, () => void>;
}) {
  return (
    <div className="ci-stat-grid">
      {items.map(([label, value]) => {
        const content = (
          <>
            <span>{label}</span>
            <strong>
              {typeof value === "number" ? number(value) : (value ?? "—")}
            </strong>
          </>
        );
        return actions[label] ? (
          <button
            type="button"
            className="ci-stat ci-stat-action"
            key={label}
            onClick={actions[label]}
          >
            {content}
          </button>
        ) : (
          <div className="ci-stat" key={label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: (string | [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="ci-field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => {
          const [v, text] =
            typeof option === "string" ? [option, option] : option;
          return (
            <option value={v} key={v}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}
export function FilterBar({
  filters,
  onChange,
  onPeriod,
  activityOnly = false,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onPeriod: (period: string, start: string, end: string) => void;
  activityOnly?: boolean;
}) {
  const [period, setPeriod] = useState("year");
  useEffect(() => {
    if (
      filters.start.endsWith("-01-01") &&
      filters.end.endsWith("-12-31") &&
      filters.start.slice(0, 4) === filters.end.slice(0, 4)
    )
      setPeriod("custom");
  }, [filters.start, filters.end]);
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="ci-filters">
      <Select
        label="Period"
        value={period}
        options={[
          ["year", "Current year"],
          ["all", "All time"],
          ["30", "Last 30 days"],
          ["3m", "Last 3 months"],
          ["6m", "Last 6 months"],
          ["12m", "Last 12 months"],
          ["custom", "Custom"],
        ]}
        onChange={(value) => {
          setPeriod(value);
          const now = new Date(),
            end = localDate(now),
            startDate = new Date(now);
          if (value === "30") startDate.setDate(startDate.getDate() - 29);
          else if (value.endsWith("m"))
            startDate.setMonth(startDate.getMonth() - parseInt(value));
          else if (value === "year") startDate.setMonth(0, 1);
          const start =
            value === "all" || value === "custom" ? "" : localDate(startDate);
          onChange({
            ...filters,
            start,
            end: value === "all" || value === "custom" ? "" : end,
          });
          onPeriod(value, start, end);
        }}
      />
      {!activityOnly && (
        <>
          <Select
            label="Time control"
            value={filters.timeClass}
            options={["all", ...POOLS]}
            onChange={(v) => set("timeClass", v)}
          />
          <Select
            label="Rated"
            value={filters.rated}
            options={["all", "rated", "unrated"]}
            onChange={(v) => set("rated", v)}
          />
          <Select
            label="Color"
            value={filters.color}
            options={["all", "white", "black"]}
            onChange={(v) => set("color", v)}
          />
          <Select
            label="Result"
            value={filters.result}
            options={["all", "win", "draw", "loss"]}
            onChange={(v) => set("result", v)}
          />
        </>
      )}
      {period === "custom" && (
        <>
          <label className="ci-field">
            From
            <input
              aria-label="From date"
              type="date"
              value={filters.start}
              max={filters.end || undefined}
              onChange={(e) => {
                set("start", e.target.value);
                onPeriod("custom", e.target.value, filters.end);
              }}
            />
          </label>
          <label className="ci-field">
            To
            <input
              aria-label="To date"
              type="date"
              value={filters.end}
              min={filters.start || undefined}
              onChange={(e) => {
                set("end", e.target.value);
                onPeriod("custom", filters.start, e.target.value);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
export function Bars({
  rows,
  compact = false,
}: {
  rows: [string, number, string?][];
  compact?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className={`ci-bars${compact ? " ci-bars-compact" : ""}`}>
      {rows.map(([label, n, detail]) => (
        <div className="ci-bar-row" key={label}>
          <span title={label}>{label}</span>
          <div
            className="ci-bar-track"
            tabIndex={0}
            title={`${label}: ${number(n)}${detail ? ` · ${detail}` : ""}`}
            aria-label={`${label}: ${number(n)}${detail ? ` · ${detail}` : ""}`}
          >
            <div style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <strong>{number(n)}</strong>
          {detail && !compact && <small>{detail}</small>}
        </div>
      ))}
    </div>
  );
}
export function Empty({
  children = "No games match these filters.",
}: {
  children?: ReactNode;
}) {
  return <p className="ci-empty">{children}</p>;
}
export function GameList({
  games,
  ratingSource = games,
}: {
  games: NormalizedGame[];
  ratingSource?: NormalizedGame[];
}) {
  const [limit, setLimit] = useState(50);
  const deltas = observedDeltas(ratingSource);
  return games.length ? (
    <>
      <div className="ci-table-scroll">
        <table className="ci-table">
          <thead>
            <tr>
              {[
                "Result",
                "Date",
                "Opponent",
                "Color",
                "Time control",
                "Observed rating",
                "Change¹",
                "Game",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...games]
              .reverse()
              .slice(0, limit)
              .map((g) => (
                <tr key={g.id}>
                  <td>
                    <span className={`ci-result ci-result-${g.result}`}>
                      {g.result}
                    </span>
                  </td>
                  <td>{displayDate(g.localDate)}</td>
                  <td>
                    {g.opponentUsername ?? "Unknown"}{" "}
                    <small>{number(g.opponentRating)}</small>
                  </td>
                  <td>{g.playerColor}</td>
                  <td>
                    {g.timeClass} · {g.timeControl}
                  </td>
                  <td>{number(g.playerRating)}</td>
                  <td>{signed(deltas.get(g.id))}</td>
                  <td>
                    {g.url ? (
                      <a href={g.url} target="_blank" rel="noopener noreferrer">
                        Open Game →
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {limit < games.length && (
        <button onClick={() => setLimit(limit + 50)}>Show more games</button>
      )}
      <p className="ci-note">
        ¹ Change between consecutive observed ratings in the same pool. Archive
        ratings are observations, not guaranteed post-game ratings.
      </p>
    </>
  ) : (
    <Empty />
  );
}
