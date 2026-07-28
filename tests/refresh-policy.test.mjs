import assert from "node:assert/strict";
import test from "node:test";

import { metricNeedsRetry, sourceIsDue } from "../scripts/refresh-policy.mjs";

test("stale, failed, and rejected metrics always retry", () => {
  assert.equal(metricNeedsRetry({ status: "stale" }), true);
  assert.equal(metricNeedsRetry({ retrievalStatus: "failed" }), true);
  assert.equal(metricNeedsRetry({ validationResult: "rejected" }), true);
  assert.equal(metricNeedsRetry({
    status: "fresh",
    retrievalStatus: "verified",
    validationResult: "accepted",
  }), false);
});

test("each source is scheduled independently by freshness or force", () => {
  const fresh = {
    status: "fresh",
    retrievalStatus: "verified",
    validationResult: "accepted",
  };
  assert.equal(sourceIsDue({ metrics: [fresh], elapsed: 2, interval: 20 }), false);
  assert.equal(sourceIsDue({ metrics: [{ ...fresh, status: "stale" }], elapsed: 2, interval: 20 }), true);
  assert.equal(sourceIsDue({ metrics: [fresh], elapsed: 20, interval: 20 }), true);
  assert.equal(sourceIsDue({ forceAll: true, metrics: [fresh], elapsed: 2, interval: 20 }), true);
});
