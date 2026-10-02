import assert from 'node:assert/strict';
import test from 'node:test';
import { observedSegments, trendWindow, weeklyFlow } from '../scripts/trend-series.mjs';

test('periods include exactly the requested calendar days, including across a year boundary', () => {
  assert.deepEqual(trendWindow('2026-10-02', '30'), { start: '2026-09-03', end: '2026-10-02' });
  assert.deepEqual(trendWindow('2026-10-02', '90'), { start: '2026-07-05', end: '2026-10-02' });
  assert.deepEqual(trendWindow('2026-01-15', '30'), { start: '2025-12-17', end: '2026-01-15' });
  assert.deepEqual(trendWindow('2028-02-29', 'year'), { start: '2028-01-01', end: '2028-12-31' });
});

test('observation traces break at null and absent dates without inventing readings', () => {
  const points = [
    { date: '2026-09-01', value: 100 }, { date: '2026-09-02', value: 101 },
    { date: '2026-09-03', value: null }, { date: '2026-09-04', value: 104 },
    { date: '2026-09-06', value: 106 },
  ];
  assert.deepEqual(observedSegments(points).map(s => s.map(p => p.date)), [
    ['2026-09-01', '2026-09-02'], ['2026-09-04'], ['2026-09-06'],
  ]);
});

test('weekly percentages pair historical values with observed dates and exclude future readings', () => {
  const rows = [
    { date: '2026-01-01', currentYear: 10, historicalMean: 20 },
    { date: '2026-01-02', currentYear: null, historicalMean: 100 },
    { date: '2026-01-03', currentYear: 30, historicalMean: 40 },
    { date: '2026-01-04', currentYear: 999, historicalMean: 200 },
    { date: '2026-01-08', currentYear: null, historicalMean: 60 },
  ];
  const [first, second] = weeklyFlow(rows, trendWindow('2026-01-03', 'year'), '2026-01-03');
  assert.equal(first.current, 20);
  assert.equal(first.pairedHistorical, 30);
  assert.equal(first.count, 2);
  assert.equal(first.through, '2026-01-03');
  assert.equal(second.current, null);
  assert.equal(second.historical, 60);
});

test('weekly aggregation clips to the selected window and keeps missing weeks as gaps', () => {
  const rows = [
    { date: '2026-01-01', currentYear: 10, historicalMean: 20 },
    { date: '2026-01-08', currentYear: null, historicalMean: 30 },
    { date: '2026-01-15', currentYear: 12, historicalMean: 40 },
  ];
  const weekly = weeklyFlow(rows, { start: '2026-01-01', end: '2026-01-15' }, '2026-01-15');
  assert.equal(observedSegments(weekly.map(p => ({ date: p.date, value: p.current })), 7).length, 2);
  assert.equal(weeklyFlow(rows, { start: '2026-01-08', end: '2026-01-15' }, '2026-01-15').length, 2);
});
