import assert from "node:assert/strict";
import test from "node:test";

import { freshMetricValue } from "../scripts/history-metric.mjs";

test("daily history excludes stale and rejected City readings", () => {
  assert.equal(freshMetricValue({ value: 218, status: "stale", validationResult: "accepted" }), null);
  assert.equal(freshMetricValue({ value: 218, status: "fresh", validationResult: "rejected" }), null);
  assert.equal(freshMetricValue({ value: 218, status: "fresh", validationResult: "accepted" }), 218);
});
