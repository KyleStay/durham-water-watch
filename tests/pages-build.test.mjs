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
    access(new URL("og.png", pagesRoot)),
  ]);

  const html = await readFile(new URL("index.html", pagesRoot), "utf8");
  assert.match(html, /Unofficial independent community dashboard/);
  assert.match(html, /How close is Durham to leaving Stage 2/);
  assert.match(html, /Illustrative scenario explorer/);
  assert.match(html, /Daily snapshot record/);
  assert.match(html, /Exact daily values/);
  assert.match(html, /All four inputs are assumptions/);
  assert.match(html, /documentID=4123(?:&amp;|&)refresh=/);
  assert.match(html, /documentID=4124(?:&amp;|&)refresh=/);
  assert.match(html, /documentID=4125(?:&amp;|&)refresh=/);
  assert.match(html, /href="\.\/assets\//);
  assert.doesNotMatch(html, /(?:href|src)="\/assets\//);
  assert.doesNotMatch(html, /\/api\/water-data/);
});

test("publishes a complete, ordered daily values ledger", async () => {
  const history = JSON.parse(await readFile(new URL("data/history.json", pagesRoot), "utf8"));
  assert.equal(history.schemaVersion, 1);
  assert.ok(history.days.length >= 4);

  const dates = history.days.map((day) => day.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(new Set(dates).size, dates.length);

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
