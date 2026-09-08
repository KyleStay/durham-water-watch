import assert from 'node:assert/strict';
import test from 'node:test';
import { metricStatus } from '../scripts/freshness.mjs';

const metric = { value: 4, observedAt: '2026-09-08T07:15:00-04:00', verifiedAt: '2026-09-08T12:01:00Z', retrievalStatus: 'verified', validationResult: 'accepted' };
test('USGS ages after three hours even with a successful morning verification', () => {
  assert.equal(metricStatus(metric, 'usgs', '2026-09-08T10:15:00-04:00'), 'fresh');
  assert.equal(metricStatus(metric, 'usgs', '2026-09-08T10:16:00-04:00'), 'stale');
});
test('stage expires after a missed verification window', () => {
  assert.equal(metricStatus(metric, 'stage', '2026-09-10T12:02:00Z'), 'stale');
});
test('City calendar freshness respects Eastern midnight and DST', () => {
  const city = { ...metric, observedAt: '2026-03-07' };
  assert.equal(metricStatus(city, 'durham', '2026-03-10T03:59:00Z'), 'fresh');
  assert.equal(metricStatus(city, 'durham', '2026-03-10T04:00:00Z'), 'stale');
});
test('failed, invalid, future and missing observations cannot appear fresh', () => {
  assert.equal(metricStatus({ ...metric, retrievalStatus: 'failed' }, 'usgs', '2026-09-08T12:00Z'), 'stale');
  assert.equal(metricStatus({ ...metric, observedAt: 'invalid' }, 'usgs'), 'stale');
  assert.equal(metricStatus(metric, 'usgs', '2026-09-01T12:00Z'), 'stale');
  assert.equal(metricStatus({ ...metric, value: null }, 'usgs'), 'unavailable');
});
