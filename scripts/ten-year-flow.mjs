import { isCalendarDate } from "./calendar-date.mjs";
import { fetchJsonWithRetry } from "./source-fetch.mjs";

export function tenYearPeriod(year) {
  return { startYear: year - 10, endYear: year - 1, startsOn: String(year - 10) + "-01-01", endsOn: String(year - 1) + "-12-31" };
}

export function tenYearSource(site, year) {
  const period = tenYearPeriod(year);
  return "https://waterservices.usgs.gov/nwis/dv/?format=json&sites=" + site
    + "&startDT=" + period.startsOn + "&endDT=" + period.endsOn + "&parameterCd=00060&statCd=00003&siteStatus=all";
}

export function parseTenYearAverage(body, site, year, now = new Date()) {
  const period = tenYearPeriod(year);
  const series = body?.value?.timeSeries?.find((item) => item.name === "USGS:" + site + ":00060:00003");
  if (series?.sourceInfo?.siteCode?.[0]?.value !== site || series?.variable?.variableCode?.[0]?.value !== "00060"
    || series?.variable?.unit?.unitCode !== "ft3/s" || !Array.isArray(series?.values?.[0]?.value)) {
    throw new Error("USGS ten-year daily-mean station, parameter or units did not validate");
  }
  const groups = new Map(), dates = new Set(), years = new Set();
  let observationCount = 0, provisionalCount = 0;
  for (const reading of series.values[0].value) {
    const date = reading.dateTime?.slice(0, 10);
    const parts = date?.split("-").map(Number);
    if (!parts || !isCalendarDate(...parts) || date < period.startsOn || date > period.endsOn || dates.has(date)) {
      throw new Error("USGS ten-year daily means include an invalid, duplicate or out-of-period date");
    }
    dates.add(date);
    if (Number(reading.value) === Number(series.variable.noDataValue ?? -999999)) continue;
    if (typeof reading.value !== "string" || !reading.value.trim()) throw new Error("USGS ten-year daily mean is missing");
    const value = Number(reading.value);
    if (!Number.isFinite(value) || value < 0) throw new Error("USGS ten-year daily mean is invalid");
    const monthDay = date.slice(5), provisional = reading.qualifiers?.includes("P") ? 1 : 0;
    const group = groups.get(monthDay) ?? { total: 0, count: 0, provisionalCount: 0 };
    group.total += value; group.count += 1; group.provisionalCount += provisional;
    groups.set(monthDay, group);
    years.add(parts[0]); observationCount += 1; provisionalCount += provisional;
  }
  if (years.size !== 10) throw new Error("USGS daily means did not cover all ten calendar years");
  const days = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 31; day += 1) {
      if (!isCalendarDate(2000, month, day)) continue;
      const monthDay = String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const group = groups.get(monthDay);
      const expectedCount = Array.from({ length: 10 }, (_, i) => period.startYear + i).filter((sampleYear) => isCalendarDate(sampleYear, month, day)).length;
      days.push({ monthDay, value: group ? Number((group.total / group.count).toFixed(4)) : null,
        count: group?.count ?? 0, expectedCount, provisionalCount: group?.provisionalCount ?? 0 });
    }
  }
  return { ...period, site, units: "ft³/s", status: "fresh", sourceUrl: tenYearSource(site, year),
    verifiedAt: now.toISOString(), checkedAt: now.toISOString(), observationCount, provisionalCount, days };
}

export async function fetchTenYearAverage(site, year, { now = new Date(), json = fetchJsonWithRetry } = {}) {
  const { response, body } = await json(tenYearSource(site, year), {
    headers: { "user-agent": "Durham Water Watch/1.0", accept: "application/json" },
  });
  if (!response.ok) throw new Error("USGS ten-year daily means returned HTTP " + response.status);
  return parseTenYearAverage(body, site, year, now);
}

export function retainTenYearAverage(previous, site, year, now, reason) {
  return { ...(previous ?? { ...tenYearPeriod(year), site, units: "ft³/s", sourceUrl: tenYearSource(site, year), days: [] }),
    status: previous?.days?.length ? "stale" : "unavailable", checkedAt: now.toISOString(),
    note: "The ten-year USGS average could not be refreshed: " + reason };
}

/** Merge by calendar date; February 29 exists only in a leap target year. */
export function withTenYearAverage(days, average, year) {
  if (!average?.days?.length) return days;
  const readings = new Map(days.map((day) => [day.date, day]));
  return average.days.flatMap((point) => {
    const [month, day] = point.monthDay.split("-").map(Number);
    if (!isCalendarDate(year, month, day)) return [];
    const date = String(year) + "-" + point.monthDay;
    return [{ date, currentYear: null, historicalMean: null, ...readings.get(date),
      tenYearMean: point.value, tenYearCount: point.count, tenYearExpectedCount: point.expectedCount }];
  });
}
