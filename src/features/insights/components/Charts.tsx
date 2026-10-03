import { useState, useId, useRef, useLayoutEffect } from "react";
import { Empty, number } from "./Common";
export interface Datum {
  label: string;
  value: number | null;
  detail?: string;
}
const colors = [
  "#81b64c",
  "#5d9239",
  "#a9cf7a",
  "#8b8985",
  "#dce9cf",
  "#6b6864",
];
function useChartWidth(active = true) {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const element = ref.current,
      measure = () => {
        const n = element.getBoundingClientRect().width;
        if (n > 0) setWidth(Math.max(120, n));
      };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);
  return { ref, width };
}
function Detail({ text }: { text: string | null }) {
  return (
    <p className="ci-chart-readout" role="status">
      {text ?? "Hover or focus a mark for details."}
    </p>
  );
}
export function Trend({
  data,
  label,
  area = false,
  compact = false,
  percent = false,
  baselineZero = true,
  tall = false,
}: {
  data: Datum[];
  label: string;
  area?: boolean;
  compact?: boolean;
  percent?: boolean;
  baselineZero?: boolean;
  tall?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null),
    [activePoint, setActivePoint] = useState<number | null>(null),
    id = useId();
  const values = data.flatMap((d) => (d.value === null ? [] : [d.value]));
  const size = useChartWidth(!!values.length);
  if (!values.length) return <Empty>No observations for this period.</Empty>;
  const low = percent
      ? 0
      : baselineZero
        ? Math.min(
            0,
            values.reduce((a, b) => Math.min(a, b), Infinity),
          )
        : values.reduce((a, b) => Math.min(a, b), Infinity) - 10,
    high = percent
      ? 100
      : Math.max(
          low + 1,
          values.reduce((a, b) => Math.max(a, b), -Infinity) +
            (baselineZero ? 0 : 10),
        );
  const W = compact ? 600 : size.width,
    H = compact ? 60 : tall ? 300 : 240,
    left = compact ? 2 : 38,
    right = compact ? 598 : W - 12,
    top = compact ? 4 : 20,
    bottom = compact ? 54 : H - 45;
  const point = (d: Datum, i: number) => [
    left + (i / Math.max(1, data.length - 1)) * (right - left),
    bottom - ((d.value! - low) / (high - low)) * (bottom - top),
  ];
  const step = Math.max(1, Math.ceil(data.length / 180));
  const sampled = data
    .map((d, i) => ({ d, i }))
    .filter(
      ({ d, i }) =>
        d.value === null ||
        data[i - 1]?.value === null ||
        data[i + 1]?.value === null ||
        i % step === 0 ||
        i === data.length - 1,
    );
  let connected = false;
  const path = sampled
    .map(({ d, i }) => {
      if (d.value === null) {
        connected = false;
        return "";
      }
      const p = point(d, i);
      const cmd = connected ? "L" : "M";
      connected = true;
      return `${cmd}${p.join(",")}`;
    })
    .join(" ");
  const runs: { d: Datum; i: number }[][] = [];
  for (const mark of sampled) {
    if (mark.d.value === null) {
      if (runs.at(-1)?.length) runs.push([]);
    } else {
      if (!runs.length) runs.push([]);
      runs.at(-1)!.push(mark);
    }
  }
  const singleton = new Set(
    runs.filter((run) => run.length === 1).map((run) => run[0].i),
  );
  const display = (d: Datum) =>
    `${d.label}: ${number(d.value)}${percent ? "%" : ""}${d.detail ? ` · ${d.detail}` : ""}`;
  return (
    <div ref={size.ref} className={compact ? "ci-spark" : "ci-chart ci-trend"}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <title>{label}</title>
        <desc>
          {compact
            ? "Historical observations"
            : "Horizontal axis: period. Vertical axis: " +
              (percent ? "percentage" : "value") +
              ". Focus a point for its exact value."}
        </desc>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--ci-chart-color, #42b8e8)" stopOpacity=".2" />
            <stop
              offset="1"
              stopColor="var(--ci-chart-color, #42b8e8)"
              stopOpacity=".08"
            />
          </linearGradient>
        </defs>
        {!compact &&
          [0, 0.5, 1].map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={right}
                y1={bottom - t * (bottom - top)}
                y2={bottom - t * (bottom - top)}
                stroke="var(--ci-track)"
              />
              <text x="2" y={bottom - t * (bottom - top) + 4}>
                {number(low + t * (high - low))}
                {percent ? "%" : ""}
              </text>
            </g>
          ))}
        {area &&
          runs
            .filter((run) => run.length > 1)
            .map((run) => {
              const points = run.map(({ d, i }) => point(d, i));
              return (
                <path
                  key={run[0].i}
                  d={`M${points.map((p) => p.join(",")).join(" L")} L${points.at(-1)![0]},${bottom} L${points[0][0]},${bottom} Z`}
                  fill={`url(#${id})`}
                />
              );
            })}
        <path
          d={path}
          fill="none"
          stroke="var(--ci-chart-color, #42b8e8)"
          strokeWidth="2"
        />
        {sampled
          .filter(({ d }) => d.value !== null)
          .map(({ d, i }) => {
            const [cx, cy] = point(d, i);
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={activePoint === i || singleton.has(i) ? 4 : 8}
                fill={
                  activePoint === i || singleton.has(i)
                    ? "var(--ci-chart-color, #42b8e8)"
                    : "transparent"
                }
                tabIndex={0}
                aria-label={display(d)}
                onFocus={() => {
                  setHover(display(d));
                  setActivePoint(i);
                }}
                onBlur={() => {
                  setHover(null);
                  setActivePoint(null);
                }}
                onMouseEnter={() => {
                  setHover(display(d));
                  setActivePoint(i);
                }}
                onMouseLeave={() => {
                  setHover(null);
                  setActivePoint(null);
                }}
              >
                <title>{display(d)}</title>
              </circle>
            );
          })}
        {!compact &&
          (W < 220
            ? [data.length - 1]
            : W < 420
              ? [0, data.length - 1]
              : [0, Math.floor((data.length - 1) / 2), data.length - 1]
          )
            .filter((n, i, a) => a.indexOf(n) === i)
            .map((i) => (
              <text
                key={i}
                x={point(data[i], i)[0]}
                y={H - 15}
                textAnchor={
                  i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
                }
              >
                {data[i].label}
              </text>
            ))}
      </svg>
      {!compact && (
        <div className="ci-trend-tooltip" role="status">
          {hover}
        </div>
      )}
    </div>
  );
}
export function Donut({
  data,
  label,
  loss = false,
  unit = "games",
  palette = colors,
}: {
  data: Datum[];
  label: string;
  loss?: boolean;
  unit?: string;
  palette?: string[];
}) {
  const [hover, setHover] = useState<string | null>(null),
    total = data.reduce((s, d) => s + (d.value ?? 0), 0);
  let offset = 0;
  if (!total) return <Empty>No {unit} for this breakdown.</Empty>;
  return (
    <div>
      <div className="ci-donut-layout">
        <svg
          viewBox="0 0 200 200"
          className="ci-donut"
          role="img"
          aria-label={label}
        >
          <title>{label}</title>
          {data.map((d, i) => {
            const fraction = (d.value ?? 0) / total,
              start = offset;
            offset += fraction;
            const detail = `${d.label}: ${d.value} ${unit} · ${(fraction * 100).toFixed(1)}%${d.detail ? ` · ${d.detail}` : ""}`;
            return (
              <circle
                key={d.label}
                cx="100"
                cy="100"
                r="72"
                pathLength="100"
                fill="none"
                stroke={
                  loss
                    ? ["#c94b45", "#8b8985", "#b57f79", "#d6bdb8"][i % 4]
                    : palette[i % palette.length]
                }
                strokeWidth="26"
                strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`}
                strokeDashoffset={-start * 100}
                transform="rotate(-90 100 100)"
                tabIndex={0}
                aria-label={detail}
                onFocus={() => setHover(detail)}
                onBlur={() => setHover(null)}
                onMouseEnter={() => setHover(detail)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{detail}</title>
              </circle>
            );
          })}
          <text x="100" y="100" textAnchor="middle" className="ci-donut-total">
            {number(total)}
          </text>
          <text x="100" y="121" textAnchor="middle">
            {unit}
          </text>
        </svg>
        <ul className="ci-chart-legend">
          {data.map((d, i) => (
            <li key={d.label}>
              <i
                style={{
                  background: loss
                    ? ["#c94b45", "#8b8985", "#b57f79", "#d6bdb8"][i % 4]
                    : palette[i % palette.length],
                }}
              />
              <span>{d.label}</span>
              <strong>{number(d.value)}</strong>
              <small>{(((d.value ?? 0) / total) * 100).toFixed(1)}%</small>
            </li>
          ))}
        </ul>
      </div>
      <Detail text={hover} />
    </div>
  );
}
export interface Outcome {
  label: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}
export function Stacked({ data }: { data: Outcome[] }) {
  return (
    <div className="ci-stacked">
      <p className="ci-note">Wins (green) · Draws (gray) · Losses (red)</p>
      {data.map((d) => (
        <div className="ci-stack-row" key={d.label}>
          <div className="ci-row">
            <strong>{d.label}</strong>
            <span>
              {d.games} games · {d.winRate.toFixed(1)}% wins
            </span>
          </div>
          <div className="ci-stack-track">
            {(["wins", "draws", "losses"] as const).map((k, i) => (
              <div
                key={k}
                style={{
                  width: `${d.games ? (d[k] / d.games) * 100 : 0}%`,
                  background: ["#81b64c", "#8b8985", "#c94b45"][i],
                }}
                tabIndex={d[k] ? 0 : undefined}
                aria-label={`${d.label}: ${d[k]} ${k}, ${d.games ? ((d[k] / d.games) * 100).toFixed(1) : 0}%`}
                title={`${d.label}: ${d[k]} ${k}, ${d.games ? ((d[k] / d.games) * 100).toFixed(1) : 0}%`}
              >
                <span>{d[k] || ""}</span>
              </div>
            ))}
          </div>
          <small>
            {d.wins} W · {d.draws} D · {d.losses} L
          </small>
        </div>
      ))}
    </div>
  );
}
export function Columns({ data, label }: { data: Datum[]; label: string }) {
  const [hover, setHover] = useState<string | null>(null),
    max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const size = useChartWidth(),
    W = size.width;
  return (
    <div ref={size.ref} className="ci-chart">
      <svg viewBox={`0 0 ${W} 240`} role="img" aria-label={label}>
        <title>{label}</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="34"
              x2={W - 12}
              y1={195 - t * 165}
              y2={195 - t * 165}
              stroke="var(--ci-border)"
            />
            <text x="2" y={199 - t * 165}>
              {number(t * max)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const width = (W - 46) / Math.max(1, data.length),
            h = ((d.value ?? 0) / max) * 165,
            text = `${d.label}: ${number(d.value)} games${d.detail ? ` · ${d.detail}` : ""}`;
          return (
            <g key={d.label}>
              <rect
                x={36 + i * width}
                y={195 - h}
                width={width * 0.7}
                height={Math.max(1, h)}
                rx="2"
                fill="#81b64c"
                tabIndex={0}
                aria-label={text}
                onFocus={() => setHover(text)}
                onBlur={() => setHover(null)}
                onMouseEnter={() => setHover(text)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{text}</title>
              </rect>
              {i % Math.max(1, Math.ceil((data.length * 28) / (W - 46))) ===
                0 && (
                <text
                  x={36 + i * width + width * 0.35}
                  y="218"
                  textAnchor="middle"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Detail text={hover} />
    </div>
  );
}
export function Scatter({
  data,
  label,
  xLabel,
  yLabel,
  percent = false,
}: {
  data: { label: string; x: number; y: number; detail?: string }[];
  label: string;
  xLabel: string;
  yLabel: string;
  percent?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const size = useChartWidth(!!data.length),
    W = size.width;
  if (!data.length)
    return <Empty>Insufficient observations for this plot.</Empty>;
  const maxX = Math.max(1, ...data.map((d) => d.x)),
    minX = Math.min(0, ...data.map((d) => d.x)),
    maxY = percent ? 100 : Math.max(1, ...data.map((d) => d.y));
  return (
    <div ref={size.ref} className="ci-chart">
      <svg viewBox={`0 0 ${W} 260`} role="img" aria-label={label}>
        <title>{label}</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1="36"
              x2={W - 12}
              y1={200 - t * 165}
              y2={200 - t * 165}
              stroke="var(--ci-border)"
            />
            <text x="4" y={204 - t * 165}>
              {number(t * maxY)}
              {percent ? "%" : ""}
            </text>
            <text
              x={36 + t * (W - 48)}
              y="220"
              textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
            >
              {number(minX + t * (maxX - minX))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const text = `${d.label}: ${xLabel} ${number(d.x)} · ${yLabel} ${number(d.y)}${percent ? "%" : ""}${d.detail ? ` · ${d.detail}` : ""}`;
          return (
            <circle
              key={i}
              cx={36 + ((d.x - minX) / (maxX - minX)) * (W - 48)}
              cy={200 - (d.y / maxY) * 165}
              r="5"
              fill={
                percent
                  ? "#5d9239"
                  : d.y === 0
                    ? "#c94b45"
                    : d.y === 0.5
                      ? "#8b8985"
                      : "#5d9239"
              }
              fillOpacity=".65"
              tabIndex={0}
              aria-label={text}
              onFocus={() => setHover(text)}
              onBlur={() => setHover(null)}
              onMouseEnter={() => setHover(text)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{text}</title>
            </circle>
          );
        })}
        <text x={W / 2} y="250" textAnchor="middle">
          {xLabel}
        </text>
        <text x="36" y="16">
          {yLabel}
        </text>
      </svg>
      <Detail text={hover} />
    </div>
  );
}
