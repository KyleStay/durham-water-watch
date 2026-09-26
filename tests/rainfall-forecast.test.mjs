import assert from "node:assert/strict";
import test from "node:test";
import { parseRainfallPoint, retainRainfallForecast, fetchRainfallForecast } from "../scripts/rainfall-forecast.mjs";

const now = new Date("2026-09-26T20:00:00Z");
const attributes = { product: "7-day QPF", units: "Inches", issue_time: "2026-09-26 17:55:35", start_time: "2026-09-27 00:00:00", end_time: "2026-10-04 00:00:00", qpf: 0.5 };
const body = { features: [{ attributes }] };

test("NOAA rainfall uses forecast bands and rejects incomplete, expired or mismatched cycles", () => {
  assert.equal(parseRainfallPoint(body, now).lowerInches, 0.5);
  assert.equal(parseRainfallPoint(body, now).upperInches, 0.75);
  const point = (change) => ({ features: [{ attributes: { ...attributes, ...change } }] });
  assert.throws(() => parseRainfallPoint({ features: [] }, now), /coverage/);
  assert.throws(() => parseRainfallPoint(point({ units: "mm" }), now), /fields/);
  assert.throws(() => parseRainfallPoint(point({ qpf: 0.123 }), now), /fields/);
  assert.throws(() => parseRainfallPoint(point({ end_time: "2026-10-03 00:00:00" }), now), /period/);
  assert.throws(() => parseRainfallPoint(body, new Date("2026-10-05T12:00:00Z")), /expired/);
  assert.throws(() => parseRainfallPoint({ features: [{ attributes }, { attributes: { ...attributes, issue_time: "2026-09-26 18:00:00" } }] }, now), /cycles/);
});

test("a failed forecast retains its original period, image and verification date", () => {
  const previous = { issuedAt: "2026-09-25T18:00:00Z", verifiedAt: "2026-09-25T19:00:00Z", imagePath: "data/rainfall-forecast.png", startsAt: "2026-09-26T00:00:00Z", endsAt: "2026-10-03T00:00:00Z", locations: [{ lowerInches: 0.5 }] };
  const retained = retainRainfallForecast(previous, now, "network failed");
  assert.equal(retained.status, "stale");
  for (const key of ["issuedAt", "verifiedAt", "imagePath", "startsAt", "endsAt", "locations"]) assert.deepEqual(retained[key], previous[key]);
  assert.equal(retainRainfallForecast(undefined, now, "network failed").status, "unavailable");
});

test("forecast download rejects an invalid image before publishing a new forecast", async () => {
  const json = async (url) => ({ response: { ok: true }, body: url.includes("/query?") ? body : { name: "QPF 168 Hour Day 1-7", drawingInfo: { renderer: { uniqueValueInfos: [{ value: "0.5", symbol: { color: [16, 78, 139, 255] } }] } } } });
  await assert.rejects(fetchRainfallForecast({ now, json, bytes: async () => ({ response: { ok: true }, body: Buffer.from("error page") }) }), /expected PNG/);
});
