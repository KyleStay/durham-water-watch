/** Cloudflare Worker entry point for Durham Water Watch. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const SOURCES = {
  stage: "https://www.durhamnc.gov/1061/Durham-Saves-Water",
  data: "https://www.durhamnc.gov/1214/Current-Data",
  lakes: "https://www.durhamnc.gov/1225/Lake-Levels",
  drought: "https://www.ncdrought.org/",
  usgs: "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=02085500%2C0208521324&parameterCd=00060&siteStatus=all",
  flat: "https://waterdata.usgs.gov/monitoring-location/02085500/",
  little: "https://waterdata.usgs.gov/monitoring-location/0208521324/",
} as const;

type StoredMetric = {
  key: string;
  value: string | null;
  numericValue: number | null;
  units: string;
  sourceUrl: string;
  observedAt: string | null;
  verifiedAt: string | null;
  retrievalStatus: string;
  validationResult: string;
  previousValue: string | null;
  note: string | null;
  updatedAt: number;
};

const seedRows: StoredMetric[] = [
  row("stage", "2", 2, "stage", SOURCES.stage, "2026-06-15", "2026-07-27T13:38:00-04:00"),
  row("supply.accessible", "119", 119, "days", SOURCES.data, "2026-07-26", "2026-07-27T13:38:00-04:00"),
  row("supply.belowIntakes", "46", 46, "days", SOURCES.data, "2026-07-26", "2026-07-27T13:38:00-04:00"),
  row("supply.quarry", "30", 30, "days", SOURCES.data, "2026-07-26", "2026-07-27T13:38:00-04:00"),
  row("supply.total", "195", 195, "days", SOURCES.data, "2026-07-26", "2026-07-27T13:38:00-04:00"),
  row("reservoir.michie", "330.90", 330.9, "ft msl", SOURCES.lakes, "2026-07-23", "2026-07-27T13:38:00-04:00", "The official page has not posted a newer dated reading."),
  row("reservoir.little", "340.51", 340.51, "ft msl", SOURCES.lakes, "2026-07-23", "2026-07-27T13:38:00-04:00", "The official page has not posted a newer dated reading."),
  row("drought", "D3 · Extreme Drought", null, "category", SOURCES.drought, "2026-07-21T08:00:00-04:00", "2026-07-27T13:38:00-04:00"),
  row("streamflow.flat", "5.14", 5.14, "ft³/s", SOURCES.flat, "2026-07-27T12:45:00-04:00", "2026-07-27T13:38:00-04:00", "USGS provisional data; subject to revision."),
  row("streamflow.little", "11.8", 11.8, "ft³/s", SOURCES.little, "2026-07-27T13:15:00-04:00", "2026-07-27T13:38:00-04:00", "USGS provisional data; subject to revision."),
];

function row(key: string, value: string, numericValue: number | null, units: string, sourceUrl: string, observedAt: string, verifiedAt: string, note: string | null = null): StoredMetric {
  return { key, value, numericValue, units, sourceUrl, observedAt, verifiedAt, retrievalStatus: "verified", validationResult: "accepted", previousValue: null, note, updatedAt: Date.parse(verifiedAt) };
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS metrics (
    key text PRIMARY KEY NOT NULL,
    value text,
    numeric_value real,
    units text NOT NULL,
    source_url text NOT NULL,
    observed_at text,
    verified_at text,
    retrieval_status text NOT NULL,
    validation_result text NOT NULL,
    previous_value text,
    note text,
    updated_at integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS readings (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    metric_key text NOT NULL,
    numeric_value real NOT NULL,
    units text NOT NULL,
    observed_at text NOT NULL,
    verified_at text NOT NULL,
    source_url text NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS readings_metric_observed_idx ON readings (metric_key, observed_at)`,
  `CREATE TABLE IF NOT EXISTS quarantined_readings (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    metric_key text NOT NULL,
    payload text NOT NULL,
    reason text NOT NULL,
    received_at text NOT NULL
  )`,
];

async function ensureDatabase(db: D1Database) {
  for (const statement of schemaStatements) await db.prepare(statement).run();
  const count = await db.prepare("SELECT count(*) AS total FROM metrics").first<{ total: number }>();
  if (!count?.total) {
    await db.batch(seedRows.map((metric) => db.prepare(
      `INSERT OR IGNORE INTO metrics
      (key,value,numeric_value,units,source_url,observed_at,verified_at,retrieval_status,validation_result,previous_value,note,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(metric.key, metric.value, metric.numericValue, metric.units, metric.sourceUrl, metric.observedAt, metric.verifiedAt, metric.retrievalStatus, metric.validationResult, metric.previousValue, metric.note, metric.updatedAt)));
    await db.batch(seedRows.filter((metric) => metric.numericValue !== null && metric.key.startsWith("reservoir.")).map((metric) => db.prepare(
      `INSERT OR IGNORE INTO readings (metric_key,numeric_value,units,observed_at,verified_at,source_url) VALUES (?,?,?,?,?,?)`
    ).bind(metric.key, metric.numericValue, metric.units, metric.observedAt, metric.verifiedAt, metric.sourceUrl)));
  }
}

function daysOld(observedAt: string | null, now: Date) {
  if (!observedAt) return Number.POSITIVE_INFINITY;
  const observed = new Date(observedAt.length === 10 ? `${observedAt}T23:59:59-04:00` : observedAt);
  return (now.getTime() - observed.getTime()) / 86_400_000;
}

function publicMetric(metric: StoredMetric, now: Date) {
  const isStream = metric.key.startsWith("streamflow.");
  const isDrought = metric.key === "drought";
  const age = daysOld(metric.observedAt, now);
  const stale = isStream ? age > .125 : isDrought ? age > 9 : age > 2;
  return {
    value: metric.numericValue ?? metric.value,
    units: metric.units,
    sourceUrl: metric.sourceUrl,
    observedAt: metric.observedAt,
    verifiedAt: metric.verifiedAt,
    status: metric.value === null ? "unavailable" : stale || metric.retrievalStatus === "failed" ? "stale" : "fresh",
    note: metric.note || undefined,
    previousValue: metric.previousValue,
  };
}

async function dashboardPayload(db?: D1Database) {
  let rows = seedRows;
  if (db) {
    await ensureDatabase(db);
    const result = await db.prepare(
      `SELECT key,value,numeric_value AS numericValue,units,source_url AS sourceUrl,observed_at AS observedAt,
       verified_at AS verifiedAt,retrieval_status AS retrievalStatus,validation_result AS validationResult,
       previous_value AS previousValue,note,updated_at AS updatedAt FROM metrics`
    ).all<StoredMetric>();
    if (result.results.length) rows = result.results;
  }
  const byKey = new Map(rows.map((metric) => [metric.key, metric]));
  const get = (key: string) => byKey.get(key) || seedRows.find((metric) => metric.key === key)!;
  const now = new Date();
  return {
    stage: { ...publicMetric(get("stage"), now), effectiveDate: get("stage").observedAt },
    supply: {
      accessible: publicMetric(get("supply.accessible"), now),
      belowIntakes: publicMetric(get("supply.belowIntakes"), now),
      quarry: publicMetric(get("supply.quarry"), now),
      total: publicMetric(get("supply.total"), now),
    },
    reservoirs: {
      michie: { ...publicMetric(get("reservoir.michie"), now), fullPool: 341 },
      little: { ...publicMetric(get("reservoir.little"), now), fullPool: 355 },
    },
    drought: publicMetric(get("drought"), now),
    streamflow: {
      flat: publicMetric(get("streamflow.flat"), now),
      little: publicMetric(get("streamflow.little"), now),
    },
    historyStarts: "2026-07-27",
  };
}

function parseDate(text: string) {
  const match = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) throw new Error("No recognizable official date");
  const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]} 12:00:00 GMT-0400`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Official date did not parse");
  return parsed.toISOString().slice(0, 10);
}

function numberFrom(text: string, expression: RegExp, label: string) {
  const match = text.match(expression);
  if (!match) throw new Error(`${label} did not parse`);
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) throw new Error(`${label} was not numeric`);
  return value;
}

async function fetchOfficialText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": "Durham Water Watch/1.0 (+independent community dashboard)" } });
  if (!response.ok || !response.url.startsWith(url.split("?")[0])) throw new Error(`Official source retrieval failed (${response.status})`);
  return response.text();
}

async function currentMetric(db: D1Database, key: string) {
  return db.prepare(
    `SELECT key,value,numeric_value AS numericValue,units,source_url AS sourceUrl,observed_at AS observedAt,
     verified_at AS verifiedAt,retrieval_status AS retrievalStatus,validation_result AS validationResult,
     previous_value AS previousValue,note,updated_at AS updatedAt FROM metrics WHERE key=?`
  ).bind(key).first<StoredMetric>();
}

async function quarantine(db: D1Database, key: string, payload: unknown, reason: string) {
  await db.prepare("INSERT INTO quarantined_readings (metric_key,payload,reason,received_at) VALUES (?,?,?,?)")
    .bind(key, JSON.stringify(payload).slice(0, 6000), reason, new Date().toISOString()).run();
}

async function acceptMetric(db: D1Database, next: StoredMetric, implausibleDelta?: number) {
  const current = await currentMetric(db, next.key);
  if (current?.observedAt && next.observedAt && new Date(next.observedAt) < new Date(current.observedAt)) {
    await quarantine(db, next.key, next, "Incoming observation is older than the verified reading");
    return;
  }
  if (implausibleDelta && current?.numericValue !== null && current?.numericValue !== undefined && next.numericValue !== null && Math.abs(next.numericValue - current.numericValue) > implausibleDelta) {
    await quarantine(db, next.key, next, `Implausible change exceeded ${implausibleDelta} ${next.units}`);
    return;
  }
  const previousValue = current?.value ?? null;
  await db.prepare(
    `INSERT INTO metrics (key,value,numeric_value,units,source_url,observed_at,verified_at,retrieval_status,validation_result,previous_value,note,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,numeric_value=excluded.numeric_value,units=excluded.units,
     source_url=excluded.source_url,observed_at=excluded.observed_at,verified_at=excluded.verified_at,retrieval_status=excluded.retrieval_status,
     validation_result=excluded.validation_result,previous_value=excluded.previous_value,note=excluded.note,updated_at=excluded.updated_at`
  ).bind(next.key, next.value, next.numericValue, next.units, next.sourceUrl, next.observedAt, next.verifiedAt, "verified", "accepted", previousValue, next.note, Date.now()).run();
  if (next.numericValue !== null && next.observedAt && (next.key.startsWith("reservoir.") || next.key.startsWith("supply."))) {
    await db.prepare("INSERT OR IGNORE INTO readings (metric_key,numeric_value,units,observed_at,verified_at,source_url) VALUES (?,?,?,?,?,?)")
      .bind(next.key, next.numericValue, next.units, next.observedAt, next.verifiedAt, next.sourceUrl).run();
  }
}

async function markFailed(db: D1Database, keys: string[], error: unknown) {
  const message = error instanceof Error ? error.message : "Official source could not be refreshed";
  await db.batch(keys.map((key) => db.prepare(
    `UPDATE metrics SET retrieval_status='failed', validation_result='rejected',
     note=?, updated_at=? WHERE key=?`
  ).bind(`The official source could not be refreshed: ${message}`, Date.now(), key)));
}

async function refreshStage(db: D1Database) {
  const keys = ["stage"];
  try {
    const text = await fetchOfficialText(SOURCES.stage);
    const match = text.match(/Stage\s+([1-4])\s+in Effect[\s\S]{0,120}?Effective\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i)
      || text.match(/under a Stage\s+([1-4])\s+Water Shortage Response/i);
    if (!match) throw new Error("Stage field did not parse");
    const stage = Number(match[1]);
    const effective = match[2] ? parseDate(match[2]) : parseDate(text);
    await acceptMetric(db, row("stage", String(stage), stage, "stage", SOURCES.stage, effective, new Date().toISOString()), 2);
  } catch (error) { await markFailed(db, keys, error); }
}

async function refreshSupply(db: D1Database) {
  const keys = ["supply.accessible", "supply.belowIntakes", "supply.quarry", "supply.total"];
  try {
    const text = await fetchOfficialText(SOURCES.data);
    const section = text.slice(text.search(/Days of Supply/i));
    const observed = parseDate(section);
    const accessible = numberFrom(section, /premium water remaining[^:\d]*:\s*(\d+(?:\.\d+)?)/i, "Accessible supply");
    const below = numberFrom(section, /below the intake structures remaining[^:\d]*:\s*(\d+(?:\.\d+)?)/i, "Below-intake supply");
    const quarry = numberFrom(section, /Teer Quarry[^:\d]*:\s*(\d+(?:\.\d+)?)/i, "Teer Quarry supply");
    const total = numberFrom(section, /Total days of supply[^:\d]*:\s*(\d+(?:\.\d+)?)/i, "Total supply");
    if ([accessible, below, quarry, total].some((value) => value < 0)) throw new Error("Supply components must be nonnegative");
    if (Math.abs(accessible + below + quarry - total) > 1) throw new Error("Total is inconsistent with displayed components");
    const verified = new Date().toISOString();
    await acceptMetric(db, row(keys[0], String(accessible), accessible, "days", SOURCES.data, observed, verified), 50);
    await acceptMetric(db, row(keys[1], String(below), below, "days", SOURCES.data, observed, verified), 50);
    await acceptMetric(db, row(keys[2], String(quarry), quarry, "days", SOURCES.data, observed, verified), 50);
    await acceptMetric(db, row(keys[3], String(total), total, "days", SOURCES.data, observed, verified), 75);
  } catch (error) { await markFailed(db, keys, error); }
}

async function refreshReservoirs(db: D1Database) {
  const keys = ["reservoir.michie", "reservoir.little"];
  try {
    const text = await fetchOfficialText(SOURCES.lakes);
    const observed = parseDate(text.slice(text.search(/Current Conditions/i)));
    const michie = numberFrom(text, /Lake Michie Elevation:\s*(\d+(?:\.\d+)?)\s*feet/i, "Lake Michie elevation");
    const little = numberFrom(text, /Little River Reservoir Elevation:\s*(\d+(?:\.\d+)?)\s*(?:feet|&nbsp;feet)/i, "Little River elevation");
    const michieFull = numberFrom(text, /Lake Michie is full at\s*(\d+(?:\.\d+)?)\s*feet/i, "Lake Michie full pool");
    const littleFull = numberFrom(text, /Little River Reservoir is full at\s*(\d+(?:\.\d+)?)\s*(?:feet|&nbsp;feet)/i, "Little River full pool");
    if (michieFull !== 341 || littleFull !== 355) throw new Error("Full-pool reference did not match intended reservoir fields");
    const verified = new Date().toISOString();
    await acceptMetric(db, row(keys[0], michie.toFixed(2), michie, "ft msl", SOURCES.lakes, observed, verified), 10);
    await acceptMetric(db, row(keys[1], little.toFixed(2), little, "ft msl", SOURCES.lakes, observed, verified), 10);
  } catch (error) { await markFailed(db, keys, error); }
}

async function refreshDrought(db: D1Database) {
  const keys = ["drought"];
  try {
    const text = await fetchOfficialText(SOURCES.drought);
    const observedDate = parseDate(text.slice(text.search(/Current Conditions/i)));
    const classifications: Array<[string, string]> = [["D4", "Exceptional Drought"], ["D3", "Extreme Drought"], ["D2", "Severe Drought"], ["D1", "Moderate Drought"], ["D0", "Abnormally Dry"]];
    const found = classifications.find(([code]) => new RegExp(`#{0,4}\\s*${code}[\\s\\S]{0,1800}?\\bDurham\\b`, "i").test(text));
    if (!found) throw new Error("Durham County drought category did not parse");
    await acceptMetric(db, row("drought", `${found[0]} · ${found[1]}`, null, "category", SOURCES.drought, `${observedDate}T08:00:00-04:00`, new Date().toISOString()));
  } catch (error) { await markFailed(db, keys, error); }
}

async function refreshStreamflow(db: D1Database) {
  const keys = ["streamflow.flat", "streamflow.little"];
  try {
    const response = await fetch(SOURCES.usgs, { headers: { "User-Agent": "Durham Water Watch/1.0" } });
    if (!response.ok) throw new Error(`USGS service failed (${response.status})`);
    const json = await response.json() as {
      value?: { timeSeries?: Array<{
        sourceInfo?: { siteCode?: Array<{ value?: string }> };
        variable?: { variableCode?: Array<{ value?: string }>; unit?: { unitCode?: string } };
        values?: Array<{ value?: Array<{ value?: string; dateTime?: string; qualifiers?: string[] }> }>;
      }> };
    };
    const series = json.value?.timeSeries;
    if (!series?.length) throw new Error("USGS returned no time series");
    for (const [site, key, source] of [
      ["02085500", keys[0], SOURCES.flat],
      ["0208521324", keys[1], SOURCES.little],
    ] as const) {
      const item = series.find((candidate) => candidate.sourceInfo?.siteCode?.[0]?.value === site);
      const reading = item?.values?.[0]?.value?.[0];
      if (item?.variable?.variableCode?.[0]?.value !== "00060" || item?.variable?.unit?.unitCode !== "ft3/s") throw new Error(`USGS ${site} units or parameter mismatch`);
      const value = Number(reading?.value);
      if (!Number.isFinite(value) || value < 0 || !reading?.dateTime) throw new Error(`USGS ${site} reading did not validate`);
      await acceptMetric(db, row(key, String(value), value, "ft³/s", source, reading.dateTime, new Date().toISOString(), "USGS provisional data; subject to revision."), 10_000);
    }
  } catch (error) { await markFailed(db, keys, error); }
}

async function refreshDueMetrics(db: D1Database, forceAll = false) {
  await ensureDatabase(db);
  const now = Date.now();
  const due = async (key: string, interval: number) => {
    const metric = await currentMetric(db, key);
    return forceAll || !metric || now - metric.updatedAt > interval;
  };
  const jobs: Promise<void>[] = [];
  if (await due("stage", 24 * 60 * 60 * 1000)) jobs.push(refreshStage(db));
  if (await due("supply.total", 24 * 60 * 60 * 1000)) jobs.push(refreshSupply(db));
  if (await due("reservoir.michie", 24 * 60 * 60 * 1000)) jobs.push(refreshReservoirs(db));
  if (await due("drought", 7 * 24 * 60 * 60 * 1000)) jobs.push(refreshDrought(db));
  if (await due("streamflow.flat", 30 * 60 * 1000)) jobs.push(refreshStreamflow(db));
  await Promise.allSettled(jobs);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/water-data") {
      const payload = await dashboardPayload(env.DB);
      if (env.DB) ctx.waitUntil(refreshDueMetrics(env.DB));
      return Response.json(payload, {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    if (env.DB) ctx.waitUntil(refreshDueMetrics(env.DB, true));
  },
};

export default worker;
