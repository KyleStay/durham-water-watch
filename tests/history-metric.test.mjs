import assert from "node:assert/strict";
import test from "node:test";

import { acceptedMetricObservation } from "../scripts/history-metric.mjs";

test("daily history accepts verified delayed observations and rejects failed validation", () => {
  assert.deepEqual(acceptedMetricObservation({
    value: 218,
    observedAt: "2026-08-19",
    verifiedAt: "2026-08-24T12:02:08.319Z",
    sourceUrl: "official",
    status: "stale",
    validationResult: "accepted",
  }), {
    value: 218,
    observedAt: "2026-08-19",
    verifiedAt: "2026-08-24T12:02:08.319Z",
    sourceUrl: "official",
  });
  assert.equal(acceptedMetricObservation({
    value: 218,
    observedAt: "2026-08-19",
    status: "fresh",
    validationResult: "rejected",
  }), null);
});
