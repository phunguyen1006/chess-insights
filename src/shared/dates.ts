export const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const fromUnixLocal = (seconds: number): string =>
  localDate(new Date(seconds * 1000));
export const parseDate = (key: string): Date => new Date(`${key}T12:00:00`);
export function addDays(key: string, count: number): string {
  const d = parseDate(key);
  d.setDate(d.getDate() + count);
  return localDate(d);
}
export function calendar(year: number): (string | null)[][] {
  const first = `${year}-01-01`,
    last = `${year}-12-31`;
  let day = addDays(first, -((parseDate(first).getDay() + 6) % 7));
  const weeks: (string | null)[][] = [];
  while (day <= last) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day >= first && day <= last ? day : null);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
export const displayDate = (key: string): string =>
  parseDate(key).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
export const timezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
// Completed public games cannot end in the future. Permit one minute of clock
// skew, consistent with locally recorded puzzle completions.
export function validCompletionTime(
  seconds: unknown,
  now = Date.now(),
): seconds is number {
  return (
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds > 0 &&
    Number.isFinite(new Date(seconds * 1000).getTime()) &&
    seconds * 1000 <= now + 60_000
  );
}
