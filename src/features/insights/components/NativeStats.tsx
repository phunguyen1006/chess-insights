import type { ReactNode } from "react";
import { number } from "./Common";

export const percentage = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(1)}%`;
export const ratingDelta = (value: number | null | undefined) =>
  value == null ? "—" : `${value < 0 ? "↓" : "↑"} ${number(Math.abs(value))}`;
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds)),
    hours = Math.floor(total / 3600),
    minutes = Math.floor(total / 60) % 60,
    rest = total % 60;
  return hours
    ? `${number(hours)}h ${String(minutes).padStart(2, "0")}m`
    : total >= 60
      ? `${Math.floor(total / 60)}m ${String(rest).padStart(2, "0")}s`
      : `${number(seconds)}s`;
}
export function PoolIcon({ pool }: { pool: string }) {
  const paths: Record<string, string> = {
    rapid: "M9 2h6M12 5a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v5l3 2M18 4l2 2",
    blitz: "M13 2 5 13h6l-1 9 9-13h-6l1-7Z",
    bullet:
      "M10 8c3-4 7-6 11-5 1 4-1 8-5 11l-5-1-1-5ZM10 8 5 9l-2 5 8-1m5 1-1 5-5 2 1-8M5 18l-3 4m6-3-3 3M16 7h.01",
    daily:
      "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  };
  return (
    <svg
      className={`ci-pool-icon ci-pool-${pool}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={paths[pool] ?? "M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z"}
      />
    </svg>
  );
}
export function ChessSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ci-chess-section">
      <h3>{title}</h3>
      <div className="ci-section-body">{children}</div>
    </section>
  );
}
export function ChessSectionRow({
  label,
  value,
  detail,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
}) {
  const content = (
    <>
      <span className="ci-section-label">
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <strong>{value}</strong>
    </>
  );
  return href ? (
    <a
      className="ci-section-row"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {content}
    </a>
  ) : (
    <div className="ci-section-row">{content}</div>
  );
}
export function StatSummaryRow({
  items,
}: {
  items: [string, ReactNode, ReactNode?][];
}) {
  return (
    <div className="ci-summary-row">
      {items.map(([label, value, detail]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>
            {typeof value === "number" ? number(value) : (value ?? "—")}
          </strong>
          {detail && <small>{detail}</small>}
        </div>
      ))}
    </div>
  );
}
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="ci-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          type="button"
          key={key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
export function SecondarySidebar({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <nav className="ci-secondary-nav" aria-label={label}>
      {items.map(([key, text]) => (
        <button
          type="button"
          key={key}
          aria-current={value === key ? "page" : undefined}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </nav>
  );
}
export function WdlBar({
  wins,
  draws,
  losses,
  label = "Results",
}: {
  wins: number;
  draws: number;
  losses: number;
  label?: string;
}) {
  const total = wins + draws + losses;
  return (
    <div
      className="ci-wdl-bar"
      role="img"
      aria-label={`${label}: ${wins} wins, ${draws} draws, ${losses} losses`}
    >
      {(
        [
          ["Wins", wins],
          ["Draws", draws],
          ["Losses", losses],
        ] as const
      ).map(([name, count]) => (
        <div
          key={name}
          className={`ci-wdl-${name.toLowerCase()}`}
          style={{ width: `${total ? (count / total) * 100 : 0}%` }}
          title={`${count} ${name.toLowerCase()} · ${percentage(total ? (count / total) * 100 : null)}`}
        />
      ))}
    </div>
  );
}
