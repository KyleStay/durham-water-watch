import assert from "node:assert/strict";
import test from "node:test";

import { isCalendarDate } from "../scripts/calendar-date.mjs";

test("filters leap-day climatology rows from non-leap comparison years", () => {
  assert.equal(isCalendarDate(2026, 2, 29), false);
  assert.equal(isCalendarDate(2028, 2, 29), true);
  assert.equal(isCalendarDate(2026, 3, 1), true);
});
