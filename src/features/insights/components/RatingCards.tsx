import type { NormalizedGame } from "../../../shared/types";
import { visualSummary } from "../../../analytics/visuals";
import { Trend } from "./Charts";
import { number } from "./Common";
import { PoolIcon, ratingDelta } from "./NativeStats";
export function RatingCards({ games }: { games: NormalizedGame[] }) {
  return (
    <div className="ci-rating-cards" aria-label="Ratings by time control">
      {visualSummary(games).ratings.map(({ pool, series }) => {
        const change =
          series.length > 1 ? series.at(-1)!.value - series[0].value : null;
        return (
          <section className="ci-rating-card" key={pool}>
            <div className="ci-rating-card-header">
              <PoolIcon pool={pool} />
              <span>{pool[0].toUpperCase() + pool.slice(1)}</span>
            </div>
            <div className="ci-rating-card-value">
              <strong title="Latest observed rating in the selected period">
                {number(series.at(-1)?.value)}
              </strong>
              <span
                className={`ci-rating-card-change ${change === null || change === 0 ? "ci-neutral" : change > 0 ? "ci-positive" : "ci-negative"}`}
                title="Change between first and last observations in the period"
              >
                {ratingDelta(change)}
              </span>
            </div>
            {series.length > 1 ? (
              <Trend
                compact
                area
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
        );
      })}
    </div>
  );
}
