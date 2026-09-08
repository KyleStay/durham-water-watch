export function dailyMeanFor(station, date) {
  const value = station?.days?.find((day) => day.date === date)?.currentYear;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function backfillStreamflowDailyMeans(history, comparison) {
  for (const entry of history.days) {
    const hasFlatDay = comparison.stations.flat?.days?.some((day) => day.date === entry.date);
    const hasLittleDay = comparison.stations.little?.days?.some((day) => day.date === entry.date);
    if (!hasFlatDay && !hasLittleDay) continue;

    const unavailableFields = new Set(entry.unavailableFields ?? []);
    for (const [key, field, present] of [
      ["flat", "streamflow.flat", hasFlatDay],
      ["little", "streamflow.little", hasLittleDay],
    ]) {
      if (!present) continue;
      const value = dailyMeanFor(comparison.stations[key], entry.date);
      entry.values.streamflow[key] = value;
      if (value === null) unavailableFields.add(field);
      else unavailableFields.delete(field);
    }
    entry.unavailableFields = [...unavailableFields];
    entry.measurementKinds = {
      ...entry.measurementKinds,
      streamflow: "USGS daily mean",
    };
  }
}

export function retainComparisonYear(station, year) {
  station.days = (station.days ?? []).filter((day) => day.date.startsWith(`${year}-`));
  station.status = station.days.length ? "stale" : "unavailable";
}
