import { acceptedMetricObservation } from "./history-metric.mjs";

const CITY_FIELDS = [
  ["supply.accessible", "supply", "accessible"],
  ["supply.belowIntakes", "supply", "belowIntakes"],
  ["supply.quarry", "supply", "quarry"],
  ["supply.total", "supply", "total"],
  ["reservoirs.michie", "reservoirs", "michie"],
  ["reservoirs.little", "reservoirs", "little"],
];

const CITY_FIELD_NAMES = new Set(CITY_FIELDS.map(([field]) => field));

function validObservationDate(value) {
  if (typeof value !== "string") return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

function unique(values) {
  return [...new Set(values)];
}

export function normalizeCityAvailability(entry) {
  entry.retainedFields = (entry.retainedFields ?? []).filter((field) => !CITY_FIELD_NAMES.has(field));
  entry.quarantinedFields = (entry.quarantinedFields ?? []).filter((field) => !CITY_FIELD_NAMES.has(field));
  const unavailable = new Set((entry.unavailableFields ?? []).filter((field) => !CITY_FIELD_NAMES.has(field)));
  for (const [field, group, key] of CITY_FIELDS) {
    const value = entry.values?.[group]?.[key];
    if (typeof value !== "number" || !Number.isFinite(value)) unavailable.add(field);
  }
  entry.measurementKinds = {
    ...entry.measurementKinds,
    supply: CITY_FIELDS
      .filter(([, group]) => group === "supply")
      .some(([, group, key]) => typeof entry.values?.[group]?.[key] === "number")
      ? entry.measurementKinds?.supply ?? "exact City reading"
      : "unavailable",
    reservoirs: CITY_FIELDS
      .filter(([, group]) => group === "reservoirs")
      .some(([, group, key]) => typeof entry.values?.[group]?.[key] === "number")
      ? entry.measurementKinds?.reservoirs ?? "exact City reading"
      : "unavailable",
  };
  entry.unavailableFields = [...unavailable];
  return entry;
}

export function setCityObservation(history, field, observation) {
  const definition = CITY_FIELDS.find(([candidate]) => candidate === field);
  const date = validObservationDate(observation?.observedAt);
  if (!definition || !date || typeof observation.value !== "number" || !Number.isFinite(observation.value)) {
    return false;
  }
  const entry = history.days.find((candidate) => candidate.date === date);
  if (!entry) return false;
  const [, group, key] = definition;
  entry.values[group][key] = observation.value;
  entry.observations = {
    ...entry.observations,
    [field]: {
      observedAt: observation.observedAt,
      verifiedAt: observation.verifiedAt,
      sourceUrl: observation.sourceUrl,
      ...(observation.evidence ? { evidence: observation.evidence } : {}),
    },
  };
  entry.measurementKinds = {
    ...entry.measurementKinds,
    [group]: observation.measurementKind ?? "exact City reading",
  };
  normalizeCityAvailability(entry);
  return true;
}

export function recordCitySnapshot(history, snapshot) {
  const recorded = [];
  for (const [field, group, key] of CITY_FIELDS) {
    const metric = snapshot?.[group]?.[key];
    const observation = acceptedMetricObservation(metric);
    if (!observation) continue;
    if (setCityObservation(history, field, {
      ...observation,
      evidence: "accepted official-source refresh",
    })) recorded.push(field);
  }
  return recorded;
}

export function clearCityObservations(history) {
  for (const entry of history.days) {
    for (const [field, group, key] of CITY_FIELDS) {
      entry.values[group][key] = null;
      if (entry.observations) delete entry.observations[field];
    }
    if (entry.observations && Object.keys(entry.observations).length === 0) delete entry.observations;
    normalizeCityAvailability(entry);
  }
}

export function appendDailyEntry(history, entry) {
  const index = history.days.findIndex((candidate) => candidate.date === entry.date);
  if (index >= 0) {
    const previous = history.days[index];
    for (const [field, group, key] of CITY_FIELDS) {
      if (entry.values[group][key] === null && typeof previous.values?.[group]?.[key] === "number") {
        entry.values[group][key] = previous.values[group][key];
        entry.measurementKinds = {
          ...entry.measurementKinds,
          [group]: previous.measurementKinds?.[group] ?? "exact City reading",
        };
        if (previous.observations?.[field]) {
          entry.observations = { ...entry.observations, [field]: previous.observations[field] };
        }
      }
    }
    history.days[index] = normalizeCityAvailability(entry);
  }
  else history.days.push(entry);
  history.days = history.days
    .filter((candidate) => candidate?.date && candidate?.values)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (history.coverage && history.days.length) {
    history.coverage.startsOn = history.days[0].date;
    history.coverage.through = history.days.at(-1).date;
  }
  return history;
}

export function cityFields() {
  return CITY_FIELDS.map(([field]) => field);
}

export function cityUnavailableFields(entry) {
  return unique((entry.unavailableFields ?? []).filter((field) => CITY_FIELD_NAMES.has(field)));
}
