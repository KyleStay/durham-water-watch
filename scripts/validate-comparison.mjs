import assert from 'node:assert/strict';

export function validateComparison(comparison) {
  assert.equal(comparison.schemaVersion, 1);
  assert.ok(Number.isInteger(comparison.year));
  for (const [key, site] of [['flat', '02085500'], ['little', '0208521324']]) {
    const station = comparison.stations[key];
    assert.equal(station.site, site);
    assert.match(station.sourceUrl, /^https:\/\/waterdata\.usgs\.gov\//);
    assert.ok(['fresh', 'stale', 'unavailable'].includes(station.status));
    assert.ok(Array.isArray(station.days));
    if (station.status === 'unavailable') assert.equal(station.days.length, 0);
    else {
      assert.ok(station.days.length > 0);
      assert.match(station.historicalPeriod, /^\d{4}–\d{4}$/);
    }
    if (station.status !== 'fresh') assert.ok(typeof station.note === 'string' && station.note.length > 0, 'Fallback needs an explanation');
    const dates = new Set();
    for (const day of station.days) {
      assert.match(day.date, new RegExp(`^${comparison.year}-\\d{2}-\\d{2}$`));
      assert.equal(new Date(`${day.date}T12:00:00Z`).toISOString().slice(0, 10), day.date);
      assert.ok(!dates.has(day.date), 'Duplicate comparison date');
      dates.add(day.date);
      assert.ok(day.currentYear === null || (Number.isFinite(day.currentYear) && day.currentYear >= 0));
      assert.ok(Number.isFinite(day.historicalMean) && day.historicalMean >= 0);
      assert.ok(Number.isInteger(day.historicalSampleYears) && day.historicalSampleYears > 0);
    }
  }
}
