import { isCalendarDate } from "./calendar-date.mjs";
import { parseSupplyValues } from "./supply-parser.mjs";

export const cityPages = {
  stage: "https://www.durhamnc.gov/1061/Durham-Saves-Water",
  supply: "https://www.durhamnc.gov/1214/Current-Data",
  reservoirs: "https://www.durhamnc.gov/1225/Lake-Levels",
};
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function officialDate(text) {
  const match = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!match) throw new Error("No recognizable official date was present");
  const month = months.findIndex((name) => name.toLowerCase() === match[1].toLowerCase()) + 1;
  const day = Number(match[2]), year = Number(match[3]);
  if (!isCalendarDate(year, month, day)) throw new Error("The official date did not validate");
  return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

export function plainText(text) {
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ").trim();
}

export function cityStage(text) {
  const match = plainText(text).match(/Stage\s+([1-4])\s+in Effect[\s\S]{0,180}?Effective\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!match) throw new Error("Current stage and effective date did not parse together");
  const date = officialDate(match[2]);
  return { value: Number(match[1]), units: "stage", sourceUrl: cityPages.stage, observedAt: date, effectiveDate: date };
}

export function citySupply(text) {
  const start = text.search(/Days of Supply/i);
  if (start < 0) throw new Error("Days-of-supply section was missing");
  const section = plainText(text.slice(start));
  const asOf = section.search(/As of\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i);
  return { values: parseSupplyValues(section), observedAt: officialDate(asOf >= 0 ? section.slice(asOf) : section) };
}

export function cityReservoir(text, key) {
  const start = text.search(/Current Conditions/i);
  if (start < 0) throw new Error("Current reservoir section was missing");
  const section = plainText(text.slice(start));
  const name = key === "michie" ? "Lake Michie" : "Little River Reservoir";
  const expected = key === "michie" ? 341 : 355;
  const reading = section.match(new RegExp(name + " Elevation:\\s*(\\d+(?:\\.\\d+)?)\\s*feet", "i"));
  const full = section.match(new RegExp((key === "michie" ? "Lake Michie" : "Little River Reservoir") + " is full at\\s*(\\d+(?:\\.\\d+)?)\\s*feet", "i"));
  if (!reading || !full || Number(full[1]) !== expected) throw new Error(name + " elevation or full-pool fields did not validate");
  return { value: Number(reading[1]), fullPool: expected, units: "ft msl", sourceUrl: cityPages.reservoirs, observedAt: officialDate(section) };
}
