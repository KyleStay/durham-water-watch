import assert from 'node:assert/strict';
import test from 'node:test';
import { validateComparison } from '../scripts/validate-comparison.mjs';
// Unit fixtures must stay available even when a live station starts a year
// without a verified comparison. Public data is validated separately.
const sample = { schemaVersion: 1, year: 2026, stations: Object.fromEntries([
  ['flat', '02085500'], ['little', '0208521324'],
].map(([key, site]) => [key, { site, sourceUrl: `https://waterdata.usgs.gov/monitoring-location/${site}/`,
  status: 'fresh', historicalPeriod: '1990–2025',
  days: [{ date: '2026-01-01', currentYear: 10, historicalMean: 15, historicalSampleYears: 36 }],
}])) };
test('a retained comparison can publish when an official source fails', () => {
  const data = structuredClone(sample);
  data.stations.flat.status = 'stale';
  data.stations.flat.note = 'Official request failed; verified comparison retained.';
  assert.doesNotThrow(() => validateComparison(data));
  data.stations.flat.days[0].historicalMean = -1;
  assert.throws(() => validateComparison(data));
});
test('a new year may start unavailable without relabeling old observations', () => {
  const data = structuredClone(sample);
  data.year += 1;
  for (const station of Object.values(data.stations)) {
    station.status = 'unavailable'; station.days = []; station.note = 'No verified comparison for this year yet.';
  }
  assert.doesNotThrow(() => validateComparison(data));
  data.stations.flat.days = sample.stations.flat.days;
  assert.throws(() => validateComparison(data));
});

test('one unavailable comparison does not block a validated station', () => {
  const data = structuredClone(sample);
  data.stations.little.status = 'unavailable';
  data.stations.little.days = [];
  data.stations.little.historicalPeriod = null;
  data.stations.little.note = 'No verified comparison returned for this station yet.';
  assert.doesNotThrow(() => validateComparison(data));
});
