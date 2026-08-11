import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const historyPath = resolve(root, "public/data/history.json");
const streamflowPath = resolve(root, "public/data/streamflow-history.json");
const dashboardPath = resolve(root, "public/data/dashboard.json");
const startDate = "2026-03-01";

const citySupplyObservations = new Map([
  ["2026-05-18", { accessible: 135, belowIntakes: 37, quarry: 18, total: 190 }],
  ["2026-07-01", { accessible: 85, belowIntakes: 36, quarry: 24, total: 145 }],
]);

const cityReservoirObservations = new Map([
  ["2026-04-12", { michie: 340.05, little: 350.06 }],
]);

const droughtPeriods = [
  ["2026-02-24", "2026-04-13", "D2 · Severe Drought"],
  ["2026-04-14", "2026-06-08", "D3 · Extreme Drought"],
  ["2026-06-09", "2026-07-20", "D4 · Exceptional Drought"],
  ["2026-07-21", "2026-07-27", "D3 · Extreme Drought"],
  ["2026-07-28", "2026-08-10", "D2 · Severe Drought"],
];

function eachDate(first, last) {
  const dates = [];
  for (let cursor = new Date(`${first}T12:00:00Z`); cursor <= new Date(`${last}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

function droughtFor(date) {
  return droughtPeriods.find(([start, end]) => date >= start && date <= end)?.[2] ?? null;
}

const [history, streamflow, dashboard] = await Promise.all([
  readFile(historyPath, "utf8").then(JSON.parse),
  readFile(streamflowPath, "utf8").then(JSON.parse),
  readFile(dashboardPath, "utf8").then(JSON.parse),
]);

const existingByDate = new Map(history.days.map((day) => [day.date, day]));
const lastExistingDate = history.days.at(-1)?.date;
if (!lastExistingDate) throw new Error("Cannot backfill an empty history ledger");

const flatByDate = new Map(streamflow.stations.flat.days.map((day) => [day.date, day.currentYear]));
const littleByDate = new Map(streamflow.stations.little.days.map((day) => [day.date, day.currentYear]));

for (const date of eachDate(startDate, lastExistingDate)) {
  if (existingByDate.has(date)) continue;
  const supply = citySupplyObservations.get(date) ?? {
    accessible: null,
    belowIntakes: null,
    quarry: null,
    total: null,
  };
  const reservoirs = cityReservoirObservations.get(date) ?? { michie: null, little: null };
  const unavailableFields = [];
  if (supply.total === null) unavailableFields.push("supply.accessible", "supply.belowIntakes", "supply.quarry", "supply.total");
  if (reservoirs.michie === null) unavailableFields.push("reservoirs.michie", "reservoirs.little");

  existingByDate.set(date, {
    date,
    capturedAt: `${date}T12:00:00.000Z`,
    entryKind: "historical-backfill",
    values: {
      stage: date >= "2026-06-15" ? 2 : null,
      supply,
      reservoirs,
      drought: droughtFor(date),
      streamflow: {
        flat: flatByDate.get(date) ?? null,
        little: littleByDate.get(date) ?? null,
      },
    },
    retainedFields: [],
    quarantinedFields: [],
    unavailableFields: date < "2026-06-15" ? ["stage", ...unavailableFields] : unavailableFields,
    measurementKinds: {
      drought: "weekly USDM maximum category present in Durham County",
      streamflow: "USGS daily mean",
      supply: citySupplyObservations.has(date) ? "archived exact City reading" : "unavailable",
      reservoirs: cityReservoirObservations.has(date) ? "archived exact City reading" : "unavailable",
    },
  });
}

history.schemaVersion = 2;
history.coverage = {
  startsOn: startDate,
  through: [...existingByDate.keys()].sort().at(-1),
  note: "One row per date. USGS daily means and weekly USDM county categories fill the historical record. City supply and reservoir fields are populated only on dates with an exact published reading; gaps are not interpolated or forward-filled.",
  sources: [
    {
      fields: ["streamflow.flat", "streamflow.little"],
      label: "U.S. Geological Survey daily values",
      url: "https://waterservices.usgs.gov/rest/DV-Service.html",
    },
    {
      fields: ["drought"],
      label: "U.S. Drought Monitor county statistics",
      url: "https://usdmdataservices.unl.edu/",
    },
    {
      fields: ["stage"],
      label: "City of Durham Stage 2 announcement",
      url: "https://www.durhamnc.gov/m/NewsFlash/Home/Detail/4174",
    },
    {
      fields: ["supply.accessible", "supply.belowIntakes", "supply.quarry", "supply.total"],
      label: "Archived copies of the City of Durham Current Data page",
      urls: [
        "https://web.archive.org/web/20260521132738/https://www.durhamnc.gov/1214/Current-Data",
        "https://web.archive.org/web/20260706105331/https://www.durhamnc.gov/1214/Current-Data",
      ],
    },
    {
      fields: ["reservoirs.michie", "reservoirs.little"],
      label: "Archived copy of the City of Durham Lake Levels page",
      url: "https://web.archive.org/web/20260415040721/https://www.durhamnc.gov/1225/Lake-Levels",
    },
  ],
};
history.days = [...existingByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
dashboard.historyStarts = startDate;

await Promise.all([
  writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`),
  writeFile(dashboardPath, `${JSON.stringify(dashboard, null, 2)}\n`),
]);

console.log(`Backfilled ${history.days.length} daily ledger rows from ${startDate} through ${history.coverage.through}`);
