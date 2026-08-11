import assert from "node:assert/strict";
import test from "node:test";
import { parseSupplyValues } from "../scripts/supply-parser.mjs";

test("parses the City's current easily-accessible supply wording", () => {
  const section = `
    As of August 9, 2026
    Days of supply of easily accessible water remaining in Durham's reservoirs: 147
    Days of less accessible water below the intake structures remaining: 52
    Days remaining in Teer Quarry (emergency storage): 32
    Total days of supply: 231
  `;

  assert.deepEqual(parseSupplyValues(section), {
    accessible: 147,
    belowIntakes: 52,
    quarry: 32,
    total: 231,
  });
});

test("continues to parse the City's previous premium-water wording", () => {
  const section = `
    As of July 30, 2026
    Days of premium water remaining: 127
    Days of less accessible water below the intake structures remaining: 48
    Days remaining in Teer Quarry (emergency storage): 31
    Total days of supply: 206
  `;

  assert.deepEqual(parseSupplyValues(section), {
    accessible: 127,
    belowIntakes: 48,
    quarry: 31,
    total: 206,
  });
});

test("rejects internally inconsistent supply totals", () => {
  assert.throws(() => parseSupplyValues(`
    Days of supply of easily accessible water remaining: 147
    Days of less accessible water below the intake structures remaining: 52
    Days remaining in Teer Quarry: 32
    Total days of supply: 999
  `), /inconsistent/);
});
