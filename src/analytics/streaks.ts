import { addDays, localDate } from "../shared/dates";
export function streaks(keys: string[], today = localDate(new Date())) {
  const days = [...new Set(keys)].filter((d) => d <= today).sort();
  const active = new Set(days);
  let current = 0,
    cursor = active.has(today) ? today : addDays(today, -1);
  while (active.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0,
    run = 0,
    previous = "";
  for (const day of days) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return { current, longest };
}
