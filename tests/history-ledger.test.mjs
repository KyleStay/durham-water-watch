import assert from "node:assert/strict";
import test from "node:test";

import { appendDailyEntry, normalizeCityAvailability, recordCitySnapshot } from "../scripts/history-ledger.mjs";

function row(date) {
  return normalizeCityAvailability({
    date,
    capturedAt: `${date}T12:00:00.000Z`,
    values: {
      stage: 2,
      supply: { accessible: null, belowIntakes: null, quarry: null, total: null },
      reservoirs: { michie: null, little: null },
      drought: null,
      streamflow: { flat: null, little: null },
    },
    retainedFields: ["supply.total"],
    quarantinedFields: [],
    unavailableFields: [],
    measurementKinds: {},
  });
}

test("a delayed City reading repairs its observation-date row without duplicating it on capture day", () => {
  const history = { days: [row("2026-09-02"), row("2026-09-08")] };
  const metric = (value) => ({
    value,
    observedAt: "2026-09-02",
    verifiedAt: "2026-09-08T12:01:37.188Z",
    sourceUrl: "https://www.durhamnc.gov/1214/Current-Data",
    status: "stale",
    validationResult: "accepted",
  });

  recordCitySnapshot(history, {
    supply: {
      accessible: metric(113),
      belowIntakes: metric(46),
      quarry: metric(24),
      total: metric(183),
    },
    reservoirs: {},
  });

  assert.deepEqual(history.days[0].values.supply, {
    accessible: 113,
    belowIntakes: 46,
    quarry: 24,
    total: 183,
  });
  assert.equal(history.days[0].observations["supply.total"].observedAt, "2026-09-02");
  assert.equal(history.days[1].values.supply.total, null);
  assert.ok(history.days[1].unavailableFields.includes("supply.total"));
  assert.ok(!history.days[1].retainedFields.includes("supply.total"));
});

test("daily archive remains complete after more than 366 rows and a year rollover", () => {
  const history = { coverage: {}, days: [] };
  for (let index = 0; index < 400; index += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    appendDailyEntry(history, row(date));
  }

  assert.equal(history.days.length, 400);
  assert.equal(history.days[0].date, "2026-01-01");
  assert.equal(history.days.at(-1).date, "2027-02-04");
  assert.deepEqual(history.coverage, { startsOn: "2026-01-01", through: "2027-02-04" });
});

test("replacing today's row preserves a verified City observation already stored there", () => {
  const history = { coverage: {}, days: [row("2026-09-08")] };
  history.days[0].values.supply.total = 180;
  history.days[0].observations = {
    "supply.total": { observedAt: "2026-09-08", sourceUrl: "official" },
  };
  normalizeCityAvailability(history.days[0]);

  appendDailyEntry(history, row("2026-09-08"));

  assert.equal(history.days[0].values.supply.total, 180);
  assert.equal(history.days[0].observations["supply.total"].observedAt, "2026-09-08");
  assert.ok(!history.days[0].unavailableFields.includes("supply.total"));
});
