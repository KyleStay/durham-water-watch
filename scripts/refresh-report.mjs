const fields = [
  ["stage", "Water shortage stage"], ["supply.accessible", "Accessible supply"], ["supply.belowIntakes", "Below-intake supply"],
  ["supply.quarry", "Teer Quarry supply"], ["supply.total", "Total supply"],
  ["reservoirs.michie", "Lake Michie elevation"], ["reservoirs.little", "Little River Reservoir elevation"],
  ["drought", "Durham County drought"], ["streamflow.flat", "Flat River current flow"], ["streamflow.little", "Little River current flow"],
];
const at = (data, path) => path.split(".").reduce((value, key) => value?.[key], data);

export function refreshReport(before, after, comparisons, checkedAt) {
  const entries = fields.map(([key, label]) => {
    const current = at(after, key), previous = at(before, key);
    const checked = current.checkedAt === checkedAt || current.verifiedAt === checkedAt;
    return {
      key, label, value: current.value, previousValue: previous?.value ?? null, units: current.units,
      observedAt: current.observedAt, previousObservedAt: previous?.observedAt ?? null,
      checkedAt: current.checkedAt ?? current.verifiedAt, sourceUrl: current.sourceUrl, status: current.status,
      outcome: !checked ? "not checked" : current.retrievalStatus === "failed" ? "retained" :
        current.value !== previous?.value || current.observedAt !== previous?.observedAt ? "updated" : "checked unchanged",
      retrievalMethod: current.lastCheckMethod ?? current.retrievalMethod ?? "direct", reason: current.retrievalStatus === "failed" ? current.note : undefined,
    };
  });
  for (const [key, station] of Object.entries(comparisons.stations)) {
    const observed = station.days.filter((day) => day.currentYear !== null);
    entries.push({
      key: "streamflowHistory." + key, label: station.name + " daily-mean comparison",
      value: observed.length, units: "daily means", observedAt: observed.at(-1)?.date ?? null,
      checkedAt: station.checkedAt ?? station.verifiedAt, sourceUrl: station.sourceUrl, status: station.status,
      outcome: station.verifiedAt === checkedAt ? "updated" : station.checkedAt === checkedAt ? "retained" : "not checked",
      historicalPeriod: station.historicalPeriod, historicalDays: station.days.length, reason: station.note,
    });
  }
  const forecast = after.rainfallForecast;
  entries.push({
    key: "rainfallForecast", label: "NOAA seven-day rainfall", value: forecast?.locations ?? [], units: "inches",
    observedAt: forecast?.issuedAt ?? null, checkedAt: forecast?.checkedAt, sourceUrl: forecast?.sourceUrl, status: forecast?.status,
    outcome: forecast?.checkedAt !== checkedAt ? "not checked" : forecast?.retrievalStatus === "verified" ? "updated" : "retained",
    startsAt: forecast?.startsAt, endsAt: forecast?.endsAt, reason: forecast?.note,
  });
  return entries;
}
