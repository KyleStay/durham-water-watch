import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isCalendarDate } from "./calendar-date.mjs";
import { freshMetricValue } from "./history-metric.mjs";
import { backfillStreamflowDailyMeans, dailyMeanFor, retainComparisonYear } from "./history-streamflow.mjs";
import { acceptMetrics } from "./metric-acceptance.mjs";
import { sourceIsDue } from "./refresh-policy.mjs";
import { parseSupplyValues } from "./supply-parser.mjs";

const snapshotPath = resolve(import.meta.dirname, "../public/data/dashboard.json");
const temporaryPath = `${snapshotPath}.next`;
const quarantinePath = resolve(import.meta.dirname, "../data/quarantine.json");
const quarantineTemporaryPath = `${quarantinePath}.next`;
const historyPath = resolve(import.meta.dirname, "../public/data/history.json");
const historyTemporaryPath = `${historyPath}.next`;
const streamflowHistoryPath = resolve(import.meta.dirname, "../public/data/streamflow-history.json");
const streamflowHistoryTemporaryPath = `${streamflowHistoryPath}.next`;
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
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

function metricAt(path) {
  return path.reduce((value, key) => value[key], snapshot);
}

function parseDate(text) {
  const match = text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (!match) throw new Error("No recognizable official date was present");
  const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00 GMT-0400`);
  if (Number.isNaN(parsed.getTime())) throw new Error("The official date did not parse");
  return parsed.toISOString().slice(0, 10);
}

function numberFrom(text, expression, label) {
  const match = text.match(expression);
  if (!match) throw new Error(`${label} did not parse`);
  const value = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new Error(`${label} was not numeric`);
  return value;
}

function htmlToPlainText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOfficialText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Durham Water Watch/1.0 (independent community dashboard)",
      accept: "text/html,application/xhtml+xml",
    },
  });
  const expected = new URL(url);
  const received = new URL(response.url);
  if (
    !response.ok
    || received.protocol !== "https:"
    || received.hostname !== expected.hostname
    || received.pathname !== expected.pathname
  ) {
    throw new Error(`Unexpected official response (${response.status})`);
  }
  return response.text();
}

function hoursSince(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(value).getTime()) / 3_600_000;
}

function accept(entries) {
  acceptMetrics(entries.map(({ path, next, maxDelta }) => ({
    current: metricAt(path),
    next,
    maxDelta,
  })), nowIso);
}

function fail(paths, error) {
  const message = error instanceof Error ? error.message : "Official source could not be refreshed";
  for (const path of paths) {
    const metric = metricAt(path);
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
  results.push(`failed: ${paths.map((path) => path.join(".")).join(", ")}`);
}

async function refreshStage() {
  const paths = [["stage"]];
  try {
    const text = await fetchOfficialText(SOURCES.stage);
    const match = text.match(
      /Stage\s+([1-4])\s+in Effect[\s\S]{0,180}?Effective\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    );
    if (!match) throw new Error("Current stage and effective date did not parse together");
    const stage = Number(match[1]);
    accept([{
      path: paths[0],
      next: {
        value: stage,
        units: "stage",
        sourceUrl: SOURCES.stage,
        observedAt: parseDate(match[2]),
        effectiveDate: parseDate(match[2]),
      },
    }]);
    results.push("verified: stage");
  } catch (error) {
    fail(paths, error);
  }
}

async function refreshSupply() {
  const paths = [
    ["supply", "accessible"],
    ["supply", "belowIntakes"],
    ["supply", "quarry"],
    ["supply", "total"],
  ];
  try {
    const text = await fetchOfficialText(SOURCES.data);
    const sectionStart = text.search(/Days of Supply/i);
    if (sectionStart < 0) throw new Error("Days-of-supply section was missing");
    const section = text.slice(sectionStart);
    const observedAt = parseDate(section);
    const { accessible, belowIntakes, quarry, total } = parseSupplyValues(section);

    const common = { units: "days", sourceUrl: SOURCES.data, observedAt };
    accept([
      { path: paths[0], next: { ...common, value: accessible }, maxDelta: 50 },
      { path: paths[1], next: { ...common, value: belowIntakes }, maxDelta: 50 },
      { path: paths[2], next: { ...common, value: quarry }, maxDelta: 50 },
      { path: paths[3], next: { ...common, value: total }, maxDelta: 75 },
    ]);
    results.push("verified: supply");
  } catch (error) {
    fail(paths, error);
  }
}

async function refreshReservoirs() {
  const paths = [["reservoirs", "michie"], ["reservoirs", "little"]];
  try {
    const text = await fetchOfficialText(SOURCES.lakes);
    const sectionStart = text.search(/Current Conditions/i);
    if (sectionStart < 0) throw new Error("Current reservoir section was missing");
    const section = htmlToPlainText(text.slice(sectionStart));
    const observedAt = parseDate(section);
    const michie = numberFrom(section, /Lake Michie Elevation:\s*(\d+(?:\.\d+)?)\s*feet/i, "Lake Michie elevation");
    const little = numberFrom(section, /Little River Reservoir Elevation:\s*(\d+(?:\.\d+)?)\s*feet/i, "Little River elevation");
    const michieFull = numberFrom(section, /Lake Michie is full at\s*(\d+(?:\.\d+)?)\s*feet/i, "Lake Michie full pool");
    const littleFull = numberFrom(section, /Little River Reservoir is full at\s*(\d+(?:\.\d+)?)\s*feet/i, "Little River full pool");
    if (michieFull !== 341 || littleFull !== 355) {
      throw new Error("Reservoir names or full-pool fields did not match");
    }

    const common = { units: "ft msl", sourceUrl: SOURCES.lakes, observedAt };
    accept([
      { path: paths[0], next: { ...common, value: michie, fullPool: 341 }, maxDelta: 10 },
      { path: paths[1], next: { ...common, value: little, fullPool: 355 }, maxDelta: 10 },
    ]);
    results.push("verified: reservoirs");
  } catch (error) {
    fail(paths, error);
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
  try {
    const response = await fetch(SOURCES.usgs, {
      headers: {
        "user-agent": "Durham Water Watch/1.0 (independent community dashboard)",
        accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`USGS service failed (${response.status})`);
    const json = await response.json();
    const series = json?.value?.timeSeries;
    if (!Array.isArray(series) || !series.length) throw new Error("USGS returned no time series");

    const accepted = [];
    for (const [site, path, sourceUrl] of [
      ["02085500", paths[0], SOURCES.flat],
      ["0208521324", paths[1], SOURCES.little],
    ]) {
      const item = series.find((candidate) => candidate?.sourceInfo?.siteCode?.[0]?.value === site);
      const reading = item?.values?.[0]?.value?.[0];
      const parameter = item?.variable?.variableCode?.[0]?.value;
      const units = item?.variable?.unit?.unitCode;
      const value = Number(reading?.value);
      if (parameter !== "00060" || units !== "ft3/s") {
        throw new Error(`USGS ${site} parameter or units did not match`);
      }
      if (!Number.isFinite(value) || value < 0 || !reading?.dateTime) {
        throw new Error(`USGS ${site} reading did not validate`);
      }
      accepted.push({
        path,
        next: {
          value,
          units: "ft³/s",
          sourceUrl,
          observedAt: reading.dateTime,
          note: "USGS provisional data; subject to revision.",
        },
        maxDelta: 10_000,
      });
    }
    accept(accepted);
    results.push("verified: streamflow");
  } catch (error) {
    fail(paths, error);
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
  const response = await fetch(url, {
    headers: {
      "user-agent": "Durham Water Watch/1.0 (independent community dashboard)",
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`USGS service failed (${response.status})`);
  return response.json();
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
      streamflowHistory.stations[key] = {
        site,
        name,
        status: "fresh",
        sourceUrl,
        historicalPeriod: `${firstStatistic.begin_yr}–${lastStatistic.end_yr}`,
        days,
      };
      results.push(`verified: ${key} historical streamflow`);
    } catch (error) {
      const station = streamflowHistory.stations[key];
      retainComparisonYear(station, year);
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
  if (metric.value === null || metric.value === undefined) {
    metric.status = "unavailable";
    return;
  }
  let stale = false;
  if (kind === "stage") stale = hoursSince(metric.verifiedAt) > 48;
  if (kind === "durham") stale = calendarDaysOld(metric.observedAt) > 2;
  if (kind === "usgs") stale = hoursSince(metric.observedAt) > 3;
  if (kind === "drought") stale = calendarDaysOld(metric.observedAt) > 9;
  metric.status = stale || metric.retrievalStatus === "failed" ? "stale" : "fresh";
}

const jobs = [refreshStreamflow(), refreshStreamflowHistory()];
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
await Promise.allSettled(jobs);

const todayParts = easternDateParts(now);
const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;

function nextDate(date) {
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}

function observedValueOn(metric, date) {
  return metric?.validationResult === "accepted"
    && metric?.observedAt?.slice(0, 10) === date
    && typeof metric.value === "number"
    && Number.isFinite(metric.value)
    ? metric.value
    : null;
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
    const supply = {
      accessible: observedValueOn(snapshot.supply.accessible, missingDate),
      belowIntakes: observedValueOn(snapshot.supply.belowIntakes, missingDate),
      quarry: observedValueOn(snapshot.supply.quarry, missingDate),
      total: observedValueOn(snapshot.supply.total, missingDate),
    };
    const reservoirs = {
      michie: observedValueOn(snapshot.reservoirs.michie, missingDate),
      little: observedValueOn(snapshot.reservoirs.little, missingDate),
    };
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
        supply: supply.total === null ? "unavailable" : "exact City reading",
        reservoirs: reservoirs.michie === null ? "unavailable" : "exact City reading",
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

const flatDailyMean = dailyMeanFor(streamflowHistory.stations.flat, today);
const littleDailyMean = dailyMeanFor(streamflowHistory.stations.little, today);
const dailyEntry = {
  date: today,
  capturedAt: nowIso,
  values: {
    stage: snapshot.stage.value,
    supply: {
      accessible: freshMetricValue(snapshot.supply.accessible),
      belowIntakes: freshMetricValue(snapshot.supply.belowIntakes),
      quarry: freshMetricValue(snapshot.supply.quarry),
      total: freshMetricValue(snapshot.supply.total),
    },
    reservoirs: {
      michie: freshMetricValue(snapshot.reservoirs.michie),
      little: freshMetricValue(snapshot.reservoirs.little),
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
  },
};
const dailyMetrics = [
  ["stage", snapshot.stage],
  ["supply.accessible", snapshot.supply.accessible],
  ["supply.belowIntakes", snapshot.supply.belowIntakes],
  ["supply.quarry", snapshot.supply.quarry],
  ["supply.total", snapshot.supply.total],
  ["reservoirs.michie", snapshot.reservoirs.michie],
  ["reservoirs.little", snapshot.reservoirs.little],
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
for (const [field, metric] of dailyMetrics.filter(([field]) => field.startsWith("supply.") || field.startsWith("reservoirs."))) {
  if (freshMetricValue(metric) === null) dailyEntry.unavailableFields.push(field);
}
const previousDailyIndex = history.days.findIndex((entry) => entry.date === today);
if (previousDailyIndex >= 0) history.days[previousDailyIndex] = dailyEntry;
else history.days.push(dailyEntry);
history.days = history.days
  .filter((entry) => entry?.date && entry?.values)
  .sort((left, right) => left.date.localeCompare(right.date))
  .slice(-366);
if (history.coverage && history.days.length) {
  history.coverage.through = history.days.at(-1).date;
}

await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await writeFile(quarantineTemporaryPath, `${JSON.stringify(quarantine.slice(-100), null, 2)}\n`);
await writeFile(historyTemporaryPath, `${JSON.stringify(history, null, 2)}\n`);
await writeFile(streamflowHistoryTemporaryPath, `${JSON.stringify(streamflowHistory, null, 2)}\n`);
await rename(temporaryPath, snapshotPath);
await rename(quarantineTemporaryPath, quarantinePath);
await rename(historyTemporaryPath, historyPath);
await rename(streamflowHistoryTemporaryPath, streamflowHistoryPath);
console.log(snapshot.lastRefreshResult);
