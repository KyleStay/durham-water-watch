import assert from "node:assert/strict";
import test from "node:test";

import { annualReservoirHeading, showsStageTwoGuidance } from "../scripts/stage-guidance.mjs";

test("Stage 2 summaries are limited to an explicit Stage 2 reading", () => {
  assert.equal(showsStageTwoGuidance(2), true);
  for (const value of [1, 3, 4, null, "2"]) {
    assert.equal(showsStageTwoGuidance(value), false);
  }
});

test("annual reservoir heading follows the current history year", () => {
  assert.equal(annualReservoirHeading("2027", "en"), "See 2027 against each of the prior ten years.");
  assert.equal(annualReservoirHeading("2027", "es"), "Compare 2027 con cada uno de los diez años anteriores.");
});
