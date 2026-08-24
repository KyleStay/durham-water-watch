import assert from "node:assert/strict";
import test from "node:test";

import { acceptMetrics } from "../scripts/metric-acceptance.mjs";

function metric(value) {
  return {
    value,
    units: "days",
    observedAt: "2026-08-20",
    verifiedAt: "2026-08-20T12:00:00.000Z",
    retrievalStatus: "verified",
    validationResult: "accepted",
    previousValue: value - 1,
  };
}

test("rejecting one field preserves every last-known-good metric in the batch", () => {
  const first = metric(100);
  const second = metric(50);
  const before = structuredClone([first, second]);

  assert.throws(() => acceptMetrics([
    {
      current: first,
      next: { value: 101, units: "days", observedAt: "2026-08-21" },
      maxDelta: 10,
    },
    {
      current: second,
      next: { value: 500, units: "days", observedAt: "2026-08-21" },
      maxDelta: 10,
    },
  ], "2026-08-21T12:00:00.000Z"), /Implausible change/);

  assert.deepEqual([first, second], before);
});

test("accepting a batch updates all metrics and their previous values", () => {
  const first = metric(100);
  const second = metric(50);

  acceptMetrics([
    {
      current: first,
      next: { value: 101, units: "days", observedAt: "2026-08-21" },
      maxDelta: 10,
    },
    {
      current: second,
      next: { value: 52, units: "days", observedAt: "2026-08-21" },
      maxDelta: 10,
    },
  ], "2026-08-21T12:00:00.000Z");

  assert.deepEqual([first.value, second.value], [101, 52]);
  assert.deepEqual([first.previousValue, second.previousValue], [100, 50]);
  assert.deepEqual([first.verifiedAt, second.verifiedAt], [
    "2026-08-21T12:00:00.000Z",
    "2026-08-21T12:00:00.000Z",
  ]);
});

test("an explicitly validated stage can change non-sequentially", () => {
  const stage = {
    value: 1,
    units: "stage",
    observedAt: "2026-08-20",
    previousValue: null,
  };

  acceptMetrics([{
    current: stage,
    next: { value: 4, units: "stage", observedAt: "2026-08-21" },
  }], "2026-08-21T12:00:00.000Z");

  assert.equal(stage.value, 4);
  assert.equal(stage.previousValue, 1);
});
