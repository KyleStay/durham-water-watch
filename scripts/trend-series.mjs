const dayMs = 86_400_000;
const time = (date) => Date.parse(`${date}T00:00:00Z`);
const dateAt = (stamp) => new Date(stamp).toISOString().slice(0, 10);

/** @param {string} end @param {'30'|'90'|'year'} period */
export function trendWindow(end, period) {
  return {
    start: period === 'year' ? `${end.slice(0, 4)}-01-01` : dateAt(time(end) - (Number(period) - 1) * dayMs),
    end: period === 'year' ? `${end.slice(0, 4)}-12-31` : end,
  };
}

/** Split on missing values AND absent calendar dates. Never imply an observation across a gap.
 * @param {{date:string,value:number|null}[]} points @param {number} [maxGapDays] */
export function observedSegments(points, maxGapDays = 1) {
  /** @type {{date:string,value:number}[][]} */
  const segments = [];
  for (const point of points) {
    if (point.value === null || !Number.isFinite(point.value)) continue;
    const previous = segments.at(-1)?.at(-1);
    if (!previous || time(point.date) - time(previous.date) > maxGapDays * dayMs) segments.push([]);
    segments.at(-1).push({ date: point.date, value: point.value });
  }
  return segments;
}

/** Calendar weeks anchored to Jan 1; partial weeks compare the same observed days.
 * @param {{date:string,currentYear:number|null,historicalMean:number}[]} days
 * @param {{start:string,end:string}} window @param {string} observedThrough */
export function weeklyFlow(days, window, observedThrough) {
  /** @type {Map<number, typeof days>} */
  const groups = new Map();
  for (const day of days) {
    if (day.date < window.start || day.date > window.end) continue;
    const week = Math.floor((time(day.date) - time(`${day.date.slice(0, 4)}-01-01`)) / (7 * dayMs));
    groups.set(week, [...(groups.get(week) ?? []), day]);
  }
  return [...groups.values()].map((values) => {
    const observed = values.filter((day) => day.date <= observedThrough && Number.isFinite(day.currentYear) && day.currentYear !== null);
    const mean = (rows, key) => rows.length ? rows.reduce((sum, day) => sum + day[key], 0) / rows.length : null;
    return {
      date: values.at(-1).date,
      start: observed[0]?.date ?? values[0].date,
      through: observed.at(-1)?.date ?? null,
      count: observed.length,
      current: mean(observed, 'currentYear'),
      historical: mean(values, 'historicalMean'),
      pairedHistorical: mean(observed, 'historicalMean'),
    };
  });
}
