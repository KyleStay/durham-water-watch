import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pagesRoot = new URL("../pages-dist/", import.meta.url);

test("produces a complete GitHub Pages artifact", async () => {
  await Promise.all([
    access(new URL("index.html", pagesRoot)),
    access(new URL("404.html", pagesRoot)),
    access(new URL(".nojekyll", pagesRoot)),
    access(new URL("data/dashboard.json", pagesRoot)),
    access(new URL("data/history.json", pagesRoot)),
    access(new URL("data/streamflow-history.json", pagesRoot)),
    access(new URL("og.png", pagesRoot)),
  ]);

  const html = await readFile(new URL("index.html", pagesRoot), "utf8");
  assert.match(html, /Unofficial independent community dashboard/);
  assert.match(html, /How close is Durham to leaving Stage 2/);
  assert.match(html, /Illustrative scenario explorer/);
  assert.match(html, /Daily snapshot record/);
  assert.match(html, /Exact daily values/);
  assert.match(html, /Year to date vs historical average/);
  assert.match(html, /vs historical daily mean/);
  assert.match(html, /What the dashed averages mean/);
  assert.match(html, /avg of available verified readings/);
  assert.match(html, /not a long-term average/);
  assert.match(html, /USGS daily means fill every date/);
  assert.match(html, /All four inputs are assumptions/);
  assert.match(html, /documentID=4123(?:&amp;|&)refresh=/);
  assert.match(html, /documentID=4124(?:&amp;|&)refresh=/);
  assert.match(html, /documentID=4125(?:&amp;|&)refresh=/);
  assert.match(html, /href="\.\/assets\//);
  assert.match(html, /import\("\.\/assets\//);
  assert.doesNotMatch(html, /(?:["'(=:]|\\")\/assets\//);
  assert.doesNotMatch(html, /\/api\/water-data/);
});

test("publishes USGS year-to-date flow against historical daily means", async () => {
  const comparison = JSON.parse(await readFile(new URL("data/streamflow-history.json", pagesRoot), "utf8"));
  assert.equal(comparison.schemaVersion, 1);
  assert.equal(comparison.year, 2026);

  for (const station of Object.values(comparison.stations)) {
    assert.equal(station.status, "fresh");
    assert.match(station.site, /^0208\d+$/);
    assert.match(station.sourceUrl, /^https:\/\/waterdata\.usgs\.gov\//);
    assert.match(station.historicalPeriod, /^\d{4}–\d{4}$/);
    assert.ok(station.days.length > 180);
    for (const day of station.days) {
      assert.match(day.date, /^2026-\d{2}-\d{2}$/);
      assert.ok(day.currentYear >= 0);
      assert.ok(day.historicalMean >= 0);
      assert.ok(day.historicalSampleYears > 0);
    }
  }
});

test("publishes a complete, ordered daily values ledger", async () => {
  const history = JSON.parse(await readFile(new URL("data/history.json", pagesRoot), "utf8"));
  assert.equal(history.schemaVersion, 2);
  assert.equal(history.coverage.startsOn, "2026-03-01");
  assert.match(history.coverage.note, /not interpolated or forward-filled/);
  assert.ok(history.days.length >= 160);

  const dates = history.days.map((day) => day.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(dates[0], "2026-03-01");
  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    assert.equal(dates[index], previous.toISOString().slice(0, 10));
  }

  for (const day of history.days) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(day.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok("stage" in day.values);
    assert.ok("total" in day.values.supply);
    assert.ok("michie" in day.values.reservoirs);
    assert.ok("little" in day.values.reservoirs);
    assert.ok("drought" in day.values);
    assert.ok("flat" in day.values.streamflow);
    assert.ok("little" in day.values.streamflow);
    assert.ok(Array.isArray(day.retainedFields));
    assert.ok(Array.isArray(day.quarantinedFields));
  }

  const byDate = new Map(history.days.map((day) => [day.date, day]));
  assert.ok(byDate.get("2026-03-01").values.streamflow.flat > 0);
  assert.equal(byDate.get("2026-03-01").values.supply.total, null);
  assert.equal(byDate.get("2026-03-01").values.reservoirs.michie, null);
  assert.deepEqual(byDate.get("2026-04-12").values.reservoirs, { michie: 340.05, little: 350.06 });
  assert.deepEqual(byDate.get("2026-05-18").values.supply, { accessible: 135, belowIntakes: 37, quarry: 18, total: 190 });
  assert.deepEqual(byDate.get("2026-07-01").values.supply, { accessible: 85, belowIntakes: 36, quarry: 24, total: 145 });
  assert.equal(byDate.get("2026-06-15").values.stage, 2);
  assert.equal(byDate.get("2026-06-09").values.drought, "D4 · Exceptional Drought");
});

test("stores transparent last-known-good metadata for every operational metric", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../public/data/dashboard.json", import.meta.url), "utf8"));
  const metrics = [
    snapshot.stage,
    snapshot.supply.accessible,
    snapshot.supply.belowIntakes,
    snapshot.supply.quarry,
    snapshot.supply.total,
    snapshot.reservoirs.michie,
    snapshot.reservoirs.little,
    snapshot.drought,
    snapshot.streamflow.flat,
    snapshot.streamflow.little,
  ];

  for (const metric of metrics) {
    assert.ok("value" in metric);
    assert.equal(typeof metric.units, "string");
    assert.match(metric.sourceUrl, /^https:\/\//);
    assert.ok("observedAt" in metric);
    assert.ok("verifiedAt" in metric);
    assert.match(metric.retrievalStatus, /^(verified|failed|unavailable)$/);
    assert.match(metric.validationResult, /^(accepted|rejected|unavailable)$/);
    assert.ok("previousValue" in metric);
  }
});

test("keeps rejected readings outside the public artifact", async () => {
  await access(new URL("../data/quarantine.json", import.meta.url));
  await assert.rejects(access(new URL("data/quarantine.json", pagesRoot)));
});
