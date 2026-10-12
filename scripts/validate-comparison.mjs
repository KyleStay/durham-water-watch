import assert from 'node:assert/strict';
import { isCalendarDate } from './calendar-date.mjs';
import { tenYearSource } from './ten-year-flow.mjs';

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
    const average = station.tenYearAverage;
    if (average) {
      assert.equal(average.site, site);
      assert.equal(average.units, 'ft³/s');
      assert.ok(['fresh', 'stale', 'unavailable'].includes(average.status));
      assert.ok(Number.isInteger(average.startYear) && Number.isInteger(average.endYear));
      assert.equal(average.endYear - average.startYear, 9);
      assert.ok(average.endYear < comparison.year, 'Average must exclude the current year');
      if (average.status === 'fresh') assert.equal(average.endYear, comparison.year - 1);
      assert.equal(average.startsOn, String(average.startYear) + '-01-01');
      assert.equal(average.endsOn, String(average.endYear) + '-12-31');
      assert.equal(average.sourceUrl, tenYearSource(site, average.endYear + 1));
      assert.ok(Array.isArray(average.days));
      if (average.status === 'unavailable') assert.equal(average.days.length, 0);
      else {
        assert.equal(average.days.length, 366);
        const monthDays = new Set();
        let count = 0, provisional = 0;
        for (const day of average.days) {
          assert.match(day.monthDay, /^\d{2}-\d{2}$/);
          const [month, date] = day.monthDay.split('-').map(Number);
          assert.ok(isCalendarDate(2000, month, date));
          assert.ok(!monthDays.has(day.monthDay)); monthDays.add(day.monthDay);
          const expected = Array.from({length: 10}, (_, i) => average.startYear + i).filter(year => isCalendarDate(year, month, date)).length;
          assert.equal(day.expectedCount, expected);
          assert.ok(Number.isInteger(day.count) && day.count >= 0 && day.count <= expected);
          assert.ok(Number.isInteger(day.provisionalCount) && day.provisionalCount >= 0 && day.provisionalCount <= day.count);
          assert.ok(day.count === 0 ? day.value === null : Number.isFinite(day.value) && day.value >= 0);
          count += day.count; provisional += day.provisionalCount;
        }
        assert.equal(average.observationCount, count);
        assert.equal(average.provisionalCount, provisional);
        assert.ok(Number.isFinite(Date.parse(average.verifiedAt)));
      }
      if (average.status !== 'fresh') assert.ok(average.note?.length > 0);
    }
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
