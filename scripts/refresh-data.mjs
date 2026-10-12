import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isCalendarDate } from "./calendar-date.mjs";
import { metricStatus } from "./freshness.mjs";
import { appendDailyEntry, normalizeCityAvailability, recordCitySnapshot } from "./history-ledger.mjs";
import { backfillStreamflowDailyMeans, dailyMeanFor, retainComparisonYear } from "./history-streamflow.mjs";
import { acceptMetrics } from "./metric-acceptance.mjs";
import { sourceIsDue } from "./refresh-policy.mjs";
import { fetchJsonWithRetry, fetchTextWithRetry } from "./source-fetch.mjs";
import { cityPages, cityStage, citySupply, cityReservoir, officialDate } from "./city-readings.mjs";
import { gitDirectory } from "./daily-lock.mjs";
import { readPageEvidence } from "./official-page-evidence.mjs";
import { refreshReport } from "./refresh-report.mjs";
import { fetchTenYearAverage, retainTenYearAverage, tenYearSource } from "./ten-year-flow.mjs";
import { fetchRainfallForecast, rainfallPage, retainRainfallForecast } from "./rainfall-forecast.mjs";

const snapshotPath = resolve(import.meta.dirname, "../public/data/dashboard.json");
const temporaryPath = `${snapshotPath}.next`;
const quarantinePath = resolve(import.meta.dirname, "../data/quarantine.json");
const quarantineTemporaryPath = `${quarantinePath}.next`;
const historyPath = resolve(import.meta.dirname, "../public/data/history.json");
const historyTemporaryPath = `${historyPath}.next`;
const streamflowHistoryPath = resolve(import.meta.dirname, "../public/data/streamflow-history.json");
const streamflowHistoryTemporaryPath = `${streamflowHistoryPath}.next`;
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const before = structuredClone(snapshot);
const evidenceByUrl = new Map();
const quarantine = JSON.parse(await readFile(quarantinePath, "utf8"));
const history = JSON.parse(await readFile(historyPath, "utf8"));
const streamflowHistory = JSON.parse(await readFile(streamflowHistoryPath, "utf8"));
const now = new Date();
const nowIso = now.toISOString();
const forceAll = process.argv.includes("--all");

const SOURCES = {
  stage: "https://www.durhamnc.gov/1061/Durham-Saves-Water",
  data: "https://www.durhamnc.gov/1214/Current-Data",
  lakes: "https://www.durhamnc.gov/1225/Lake-Levels",
  drought: "https://www.ncdrought.org/",
  usgs: "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=02085500%2C0208521324&parameterCd=00060&siteStatus=all",
  flat: "https://waterdata.usgs.gov/monitoring-location/02085500/",
  little: "https://waterdata.usgs.gov/monitoring-location/0208521324/",
};

const results = [];

async function refreshRainfall() {
  try {
    const { forecast, image } = await fetchRainfallForecast({ now });
    const imagePath = resolve(import.meta.dirname, "../public/data/rainfall-forecast.png");
    await writeFile(`${imagePath}.next`, image);
    await rename(`${imagePath}.next`, imagePath);
    snapshot.rainfallForecast = forecast;
    results.push("verified: NOAA seven-day rainfall forecast");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "NOAA forecast could not be refreshed";
    snapshot.rainfallForecast = retainRainfallForecast(snapshot.rainfallForecast, now, reason);
    quarantine.push({ metrics: ["rainfallForecast"], sourceUrl: rainfallPage, reason, receivedAt: nowIso, disposition: "rejected; last-known-good forecast preserved" });
    results.push(`failed: NOAA rainfall forecast (${reason})`);
  }
}

function metricAt(path) {
  return path.reduce((value, key) => value[key], snapshot);
}

const parseDate = officialDate;

async function fetchOfficialText(url) {
  try {
    const { response, body } = await fetchTextWithRetry(url, {
      redirect: "follow",
      headers: { "user-agent": "Durham Water Watch/1.0 (independent community dashboard)", accept: "text/html,application/xhtml+xml" },
    });
    const expected = new URL(url), received = new URL(response.url);
    if (!response.ok || received.protocol !== "https:" || received.hostname !== expected.hostname || received.pathname !== expected.pathname) {
      throw new Error(`Unexpected official response (${response.status})`);
    }
    return body;
  } catch (error) {
    if (!Object.values(cityPages).includes(url)) throw error;
    const evidence = await readPageEvidence(gitDirectory(resolve(import.meta.dirname, "..")), url, now);
    if (!evidence) throw error;
    evidenceByUrl.set(url, evidence);
    console.log(`Using freshly retrieved official page text: ${url}`);
    return evidence.text;
  }
}

function hoursSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(value).getTime()) / 3_600_000;
}

function accept(entries) {
  acceptMetrics(entries.map(({ path, next, maxDelta }) => ({
    current: metricAt(path),
    next: {
      ...next, checkedAt: nowIso,
      retrievalMethod: evidenceByUrl.has(next.sourceUrl) ? "official-page-text" : "direct",
      lastCheckMethod: evidenceByUrl.has(next.sourceUrl) ? "official-page-text" : "direct",
      sourceEvidence: evidenceByUrl.has(next.sourceUrl) ? {
        retrievedAt: evidenceByUrl.get(next.sourceUrl).retrievedAt,
        sha256: evidenceByUrl.get(next.sourceUrl).sha256,
      } : undefined,
    },
    maxDelta,
  })), nowIso);
}

function fail(paths, error) {
  const message = error instanceof Error ? error.message : "Official source could not be refreshed";
  for (const path of paths) {
    const metric = metricAt(path);
    metric.checkedAt = nowIso;
    metric.lastCheckMethod = evidenceByUrl.has(metric.sourceUrl) ? "official-page-text" : "direct";
    metric.retrievalStatus = "failed";
    metric.validationResult = "rejected";
    metric.note = `The official source could not be refreshed: ${message}`;
  }
  quarantine.push({
    metrics: paths.map((path) => path.join(".")),
    sourceUrl: metricAt(paths[0]).sourceUrl,
    reason: message,
    receivedAt: nowIso,
    disposition: "rejected; last-known-good value preserved",
  });
  results.push(`failed: ${paths.map((path) => path.join(".")).join(", ")} (${message})`);
}

async function refreshStage() {
  const paths = [["stage"]];
  try {
    accept([{ path: paths[0], next: cityStage(await fetchOfficialText(SOURCES.stage)) }]);
    results.push("verified: stage");
  } catch (error) { fail(paths, error); }
}

async function refreshSupply() {
  const paths = ["accessible", "belowIntakes", "quarry", "total"].map((key) => ["supply", key]);
  try {
    const { values, observedAt } = citySupply(await fetchOfficialText(SOURCES.data));
    // Supply components and their total must remain one consistent, dated batch.
    accept(paths.map((path) => ({ path, next: { value: values[path[1]], observedAt, units: "days", sourceUrl: SOURCES.data }, maxDelta: path[1] === "total" ? 75 : 50 })));
    results.push("verified: supply");
  } catch (error) { fail(paths, error); }
}

async function refreshReservoirs() {
  const paths = [["reservoirs", "michie"], ["reservoirs", "little"]];
  let text;
  try { text = await fetchOfficialText(SOURCES.lakes); }
  catch (error) { fail(paths, error); return; }
  for (const path of paths) {
    try {
      accept([{ path, next: cityReservoir(text, path[1]), maxDelta: 10 }]);
      results.push(`verified: ${path.join(".")}`);
    } catch (error) { fail([path], error); }
  }
}

async function refreshDrought() {
  const paths = [["drought"]];
  try {
    const text = await fetchOfficialText(SOURCES.drought);
    const sectionStart = text.search(/Current Conditions/i);
    if (sectionStart < 0) throw new Error("Current drought section was missing");
    const observedDate = parseDate(text.slice(sectionStart));
    const categories = [
      ["D4", "Exceptional Drought"],
      ["D3", "Extreme Drought"],
      ["D2", "Severe Drought"],
      ["D1", "Moderate Drought"],
      ["D0", "Abnormally Dry"],
    ];
    const countyListStart = text.search(/class=["'][^"']*\bcountylist\b/i);
    if (countyListStart < 0) throw new Error("County drought list was missing");
    const countySection = text.slice(countyListStart);
    const found = categories.find(([code]) => {
      const block = countySection.match(
        new RegExp(`<h4[^>]*class=["'][^"']*\\b${code}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/h4>\\s*<ul>([\\s\\S]*?)<\\/ul>`, "i"),
      );
      return block ? /<li[^>]*>\s*Durham\s*<\/li>/i.test(block[1]) : false;
    });
    if (!found) throw new Error("Durham County drought category did not parse");
    accept([{
      path: paths[0],
      next: {
        value: `${found[0]} · ${found[1]}`,
        units: "category",
        sourceUrl: SOURCES.drought,
        observedAt: `${observedDate}T08:00:00-04:00`,
      },
    }]);
    results.push("verified: drought");
  } catch (error) {
    fail(paths, error);
  }
}

async function refreshStreamflow() {
  const paths = [["streamflow", "flat"], ["streamflow", "little"]];
  let series;
  try {
    const { response, body: json } = await fetchJsonWithRetry(SOURCES.usgs, {
      headers: { "user-agent": "Durham Water Watch/1.0 (independent community dashboard)", accept: "application/json" },
    });
    if (!response.ok) throw new Error(`USGS service failed (${response.status})`);
    series = json?.value?.timeSeries;
    if (!Array.isArray(series) || !series.length) throw new Error("USGS returned no time series");
  } catch (error) { fail(paths, error); return; }

  for (const [site, path, sourceUrl] of [["02085500", paths[0], SOURCES.flat], ["0208521324", paths[1], SOURCES.little]]) {
    try {
      const item = series.find((candidate) => candidate?.sourceInfo?.siteCode?.[0]?.value === site);
      const reading = item?.values?.[0]?.value?.[0];
      const value = Number(reading?.value);
      if (item?.variable?.variableCode?.[0]?.value !== "00060" || item?.variable?.unit?.unitCode !== "ft3/s") {
        throw new Error(`USGS ${site} parameter or units did not match`);
      }
      if (!Number.isFinite(value) || value < 0 || !reading?.dateTime) throw new Error(`USGS ${site} reading did not validate`);
      accept([{ path, next: { value, units: "ft³/s", sourceUrl, observedAt: reading.dateTime, note: "USGS provisional data; subject to revision." }, maxDelta: 10_000 }]);
      results.push(`verified: ${path.join(".")}`);
    } catch (error) { fail([path], error); }
  }
}

function parseUsgsStatistics(text, site) {
  const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
  const headerIndex = lines.findIndex((line) => line.startsWith("agency_cd\t"));
  if (headerIndex < 0 || !lines[headerIndex + 1]?.startsWith("5s\t")) {
    throw new Error(`USGS ${site} historical statistics did not include an RDB header`);
  }
  const headers = lines[headerIndex].split("\t");
  return lines.slice(headerIndex + 2).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  }).filter((row) => row.site_no === site && Number.isFinite(Number(row.mean_va)));
}

async function fetchUsgsJson(url) {
  const { response, body } = await fetchJsonWithRetry(url, {
    headers: {
      "user-agent": "Durham Water Watch/1.0 (independent community dashboard)",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`USGS service failed (${response.status})`);
  return body;
}

async function refreshStreamflowHistory() {
  const year = Number(easternDateParts(now).year);
  const endDate = nowIso.slice(0, 10);
  for (const [key, site, name, sourceUrl] of [
    ["flat", "02085500", "Flat River", SOURCES.flat],
    ["little", "0208521324", "Little River", SOURCES.little],
  ]) {
    try {
      const dailyUrl = `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${site}&startDT=${year}-01-01&endDT=${endDate}&parameterCd=00060&siteStatus=all`;
      const statisticsUrl = `https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=${site}&statReportType=daily&statTypeCd=mean&parameterCd=00060`;
      const [dailyJson, statisticsText] = await Promise.all([
        fetchUsgsJson(dailyUrl),
        fetchOfficialText(statisticsUrl),
      ]);
      const series = dailyJson?.value?.timeSeries?.find((item) => item?.name?.endsWith(":00003"));
      const dailyValues = series?.values?.[0]?.value;
      if (!Array.isArray(dailyValues) || dailyValues.length < 1) {
        throw new Error(`USGS ${site} returned insufficient current-year daily means`);
      }
      const statistics = parseUsgsStatistics(statisticsText, site);
      if (statistics.length < 365) {
        throw new Error(`USGS ${site} returned incomplete historical daily means`);
      }
      const dailyValuesByDay = new Map(dailyValues.map((reading) => [
        reading.dateTime.slice(5, 10),
        reading,
      ]));
      const days = statistics.flatMap((historical) => {
        const month = Number(historical.month_nu);
        const day = Number(historical.day_nu);
        if (!isCalendarDate(year, month, day)) return [];
        const monthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const reading = dailyValuesByDay.get(monthDay);
        const date = `${year}-${monthDay}`;
        const currentYear = reading ? Number(reading.value) : null;
        const historicalMean = Number(historical?.mean_va);
        if ((currentYear !== null && (!Number.isFinite(currentYear) || currentYear < 0)) || !Number.isFinite(historicalMean) || historicalMean < 0) {
          throw new Error(`USGS ${site} current or historical daily mean did not validate`);
        }
        return [{
          date,
          currentYear,
          historicalMean,
          historicalSampleYears: Number(historical.count_nu),
        }];
      });
      const firstStatistic = statistics[0];
      const lastStatistic = statistics.at(-1);
      Object.assign(streamflowHistory.stations[key], {
        site,
        name,
        status: "fresh",
        sourceUrl,
        historicalPeriod: `${firstStatistic.begin_yr}–${lastStatistic.end_yr}`,
        verifiedAt: nowIso,
        checkedAt: nowIso,
        note: undefined,
        days,
      });
      results.push(`verified: ${key} historical streamflow`);
    } catch (error) {
      const station = streamflowHistory.stations[key];
      retainComparisonYear(station, year);
      station.checkedAt = nowIso;
      station.note = `The USGS year comparison could not be refreshed: ${error instanceof Error ? error.message : "unknown error"}`;
      quarantine.push({
        metrics: [`streamflowHistory.${key}`],
        sourceUrl,
        reason: station.note,
        receivedAt: nowIso,
        disposition: "rejected; last-known-good year comparison preserved",
      });
      results.push(`failed: ${key} historical streamflow`);
    }
  }
  streamflowHistory.schemaVersion = 1;
  streamflowHistory.year = year;
  streamflowHistory.updatedAt = nowIso;
}

async function refreshTenYearHistory() {
  const year = Number(easternDateParts(now).year);
  await Promise.all([['flat', '02085500'], ['little', '0208521324']].map(async ([key, site]) => {
    const station = streamflowHistory.stations[key];
    try {
      station.tenYearAverage = await fetchTenYearAverage(site, year, { now });
      results.push(`verified: ${key} ten-year streamflow average (${year - 10}–${year - 1})`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      station.tenYearAverage = retainTenYearAverage(station.tenYearAverage, site, year, now, reason);
      quarantine.push({ metrics: [`streamflowHistory.${key}.tenYearAverage`], sourceUrl: tenYearSource(site, year), reason, receivedAt: nowIso, disposition: 'rejected; last-known-good ten-year average preserved' });
      results.push(`failed: ${key} ten-year streamflow average (${reason})`);
    }
  }));
}

function easternDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function calendarDaysOld(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const observed = value.slice(0, 10).split("-").map(Number);
  const todayParts = easternDateParts(now);
  const today = [Number(todayParts.year), Number(todayParts.month), Number(todayParts.day)];
  const observedUtc = Date.UTC(observed[0], observed[1] - 1, observed[2]);
  const todayUtc = Date.UTC(today[0], today[1] - 1, today[2]);
  return Math.floor((todayUtc - observedUtc) / 86_400_000);
}

function updateStatus(metric, kind) {
  metric.status = metricStatus(metric, kind, now);
}

const jobs = [refreshStreamflow(), refreshStreamflowHistory(), refreshTenYearHistory(), refreshRainfall()];
if (sourceIsDue({
  forceAll,
  metrics: [snapshot.stage],
  elapsed: hoursSince(snapshot.stage.verifiedAt),
  interval: 20,
})) jobs.push(refreshStage());
if (sourceIsDue({
  forceAll,
  metrics: Object.values(snapshot.supply),
  elapsed: hoursSince(snapshot.supply.total.verifiedAt),
  interval: 20,
})) jobs.push(refreshSupply());
if (sourceIsDue({
  forceAll,
  metrics: Object.values(snapshot.reservoirs),
  elapsed: Math.max(
    hoursSince(snapshot.reservoirs.michie.verifiedAt),
    hoursSince(snapshot.reservoirs.little.verifiedAt),
  ),
  interval: 20,
})) jobs.push(refreshReservoirs());
if (sourceIsDue({
  forceAll,
  metrics: [snapshot.drought],
  elapsed: calendarDaysOld(snapshot.drought.observedAt),
  interval: 7,
})) jobs.push(refreshDrought());
const outcomes = await Promise.allSettled(jobs);
const unexpectedFailures = outcomes.filter((result) => result.status === "rejected");
if (unexpectedFailures.length) throw new AggregateError(unexpectedFailures.map((result) => result.reason), "Source checks did not complete");

const todayParts = easternDateParts(now);
const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

function nextDate(date) {
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}

const existingDates = new Set(history.days.map((entry) => entry.date));
let missingDate = history.coverage?.startsOn
  ?? history.days.map((entry) => entry.date).sort().at(0);
while (missingDate < today) {
  if (!existingDates.has(missingDate)) {
    const previousEntry = history.days
      .filter((entry) => entry.date < missingDate)
      .sort((left, right) => left.date.localeCompare(right.date))
      .at(-1);
    const supply = { accessible: null, belowIntakes: null, quarry: null, total: null };
    const reservoirs = { michie: null, little: null };
    const flat = dailyMeanFor(streamflowHistory.stations.flat, missingDate);
    const little = dailyMeanFor(streamflowHistory.stations.little, missingDate);
    const unavailableFields = [];
    for (const [field, value] of [
      ["supply.accessible", supply.accessible],
      ["supply.belowIntakes", supply.belowIntakes],
      ["supply.quarry", supply.quarry],
      ["supply.total", supply.total],
      ["reservoirs.michie", reservoirs.michie],
      ["reservoirs.little", reservoirs.little],
      ["streamflow.flat", flat],
      ["streamflow.little", little],
    ]) {
      if (value === null) unavailableFields.push(field);
    }
    history.days.push({
      date: missingDate,
      capturedAt: `${missingDate}T12:00:00.000Z`,
      entryKind: "missed-run-backfill",
      values: {
        stage: previousEntry?.values?.stage ?? snapshot.stage.value,
        supply,
        reservoirs,
        drought: previousEntry?.values?.drought ?? snapshot.drought.value,
        streamflow: { flat, little },
      },
      retainedFields: [],
      quarantinedFields: [],
      unavailableFields,
      measurementKinds: {
        streamflow: "USGS daily mean",
        supply: "unavailable",
        reservoirs: "unavailable",
      },
    });
  }
  missingDate = nextDate(missingDate);
}

backfillStreamflowDailyMeans(history, streamflowHistory);

updateStatus(snapshot.stage, "stage");
updateStatus(snapshot.supply.accessible, "durham");
updateStatus(snapshot.supply.belowIntakes, "durham");
updateStatus(snapshot.supply.quarry, "durham");
updateStatus(snapshot.supply.total, "durham");
updateStatus(snapshot.reservoirs.michie, "durham");
updateStatus(snapshot.reservoirs.little, "durham");
updateStatus(snapshot.drought, "drought");
updateStatus(snapshot.streamflow.flat, "usgs");
updateStatus(snapshot.streamflow.little, "usgs");

snapshot.generatedAt = nowIso;
snapshot.lastRefreshResult = results.join("; ") || "No source was due for refresh.";
snapshot.refreshReport = refreshReport(before, snapshot, streamflowHistory, nowIso);

const flatDailyMean = dailyMeanFor(streamflowHistory.stations.flat, today);
const littleDailyMean = dailyMeanFor(streamflowHistory.stations.little, today);
const dailyEntry = {
  date: today,
  capturedAt: nowIso,
  values: {
    stage: snapshot.stage.value,
    supply: {
      accessible: null,
      belowIntakes: null,
      quarry: null,
      total: null,
    },
    reservoirs: {
      michie: null,
      little: null,
    },
    drought: snapshot.drought.value,
    streamflow: {
      flat: flatDailyMean,
      little: littleDailyMean,
    },
  },
  retainedFields: [],
  quarantinedFields: [],
  unavailableFields: [],
  measurementKinds: {
    streamflow: "USGS daily mean",
    supply: "unavailable",
    reservoirs: "unavailable",
  },
};
const dailyMetrics = [
  ["stage", snapshot.stage],
  ["drought", snapshot.drought],
  ["streamflow.flat", snapshot.streamflow.flat],
  ["streamflow.little", snapshot.streamflow.little],
];
for (const [field, metric] of dailyMetrics) {
  if (metric.status !== "fresh") dailyEntry.retainedFields.push(field);
  if (metric.validationResult === "rejected") dailyEntry.quarantinedFields.push(field);
}
if (flatDailyMean === null) dailyEntry.unavailableFields.push("streamflow.flat");
if (littleDailyMean === null) dailyEntry.unavailableFields.push("streamflow.little");
normalizeCityAvailability(dailyEntry);
appendDailyEntry(history, dailyEntry);
recordCitySnapshot(history, snapshot);
history.schemaVersion = 3;

await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeFile(quarantineTemporaryPath, `${JSON.stringify(quarantine.slice(-100), null, 2)}\n`);
await writeFile(historyTemporaryPath, `${JSON.stringify(history, null, 2)}\n`);
await writeFile(streamflowHistoryTemporaryPath, `${JSON.stringify(streamflowHistory, null, 2)}\n`);
await rename(temporaryPath, snapshotPath);
await rename(quarantineTemporaryPath, quarantinePath);
await rename(historyTemporaryPath, historyPath);
await rename(streamflowHistoryTemporaryPath, streamflowHistoryPath);
console.log(snapshot.lastRefreshResult);
