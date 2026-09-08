import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateComparison } from '../scripts/validate-comparison.mjs';
const sample = JSON.parse(await readFile(new URL('../public/data/streamflow-history.json', import.meta.url), 'utf8'));
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
