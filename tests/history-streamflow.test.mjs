import assert from "node:assert/strict";
import test from "node:test";

import { backfillStreamflowDailyMeans, dailyMeanFor, retainComparisonYear } from "../scripts/history-streamflow.mjs";

test("daily ledger streamflow uses daily means instead of point samples", () => {
  const history = {
    days: [
      { date: "2026-08-21", values: { streamflow: { flat: 0.1, little: 1.17 } } },
      { date: "2026-08-22", values: { streamflow: { flat: 0.41, little: 5.25 } } },
    ],
  };
  const comparison = {
    stations: {
      flat: { days: [
        { date: "2026-08-21", currentYear: 0.34 },
        { date: "2026-08-22", currentYear: null },
      ] },
      little: { days: [
        { date: "2026-08-21", currentYear: 4.97 },
        { date: "2026-08-22", currentYear: null },
      ] },
    },
  };

  backfillStreamflowDailyMeans(history, comparison);

  assert.deepEqual(history.days[0].values.streamflow, { flat: 0.34, little: 4.97 });
  assert.equal(history.days[0].measurementKinds.streamflow, "USGS daily mean");
  assert.deepEqual(history.days[1].values.streamflow, { flat: null, little: null });
  assert.deepEqual(history.days[1].unavailableFields, ["streamflow.flat", "streamflow.little"]);
  assert.equal(history.days[1].measurementKinds.streamflow, "USGS daily mean");
  assert.equal(dailyMeanFor(comparison.stations.flat, "2026-08-22"), null);
});

test("a failed new-year refresh never relabels prior-year comparison rows", () => {
  const station = {
    status: "fresh",
    days: [{ date: "2026-12-31", currentYear: 10 }],
  };

  retainComparisonYear(station, 2027);

  assert.deepEqual(station.days, []);
  assert.equal(station.status, "unavailable");
});
