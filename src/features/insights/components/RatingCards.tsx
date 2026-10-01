import type { NormalizedGame } from "../../../shared/types";
import { visualSummary } from "../../../analytics/visuals";
import { Trend } from "./Charts";
import { number, signed } from "./Common";
export function RatingCards({ games }: { games: NormalizedGame[] }) {
  return (
    <div className="ci-rating-cards">
      {visualSummary(games).ratings.map(({ pool, series }, i) => (
        <section className="ci-stat ci-rating-card" key={pool}>
          <span>
            <b aria-hidden="true">{["◷", "ϟ", "●", "▣"][i]}</b>{" "}
            {pool[0].toUpperCase() + pool.slice(1)}
          </span>
          <div className="ci-row">
            <strong>{number(series.at(-1)?.value)}</strong>
            <small>
              {series.length > 1
                ? signed(series.at(-1)!.value - series[0].value)
                : "—"}{" "}
              in period
            </small>
          </div>
          {series.length > 1 ? (
            <Trend
              compact
              baselineZero={false}
              data={series}
              label={`${pool} observed rating sparkline`}
            />
          ) : (
            <p className="ci-note">
              {series.length
                ? "One observation; no trend yet."
                : "No rated observations."}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
