export function dailyMeanFor(station, date) {
  const value = station?.days?.find((day) => day.date === date)?.currentYear;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function backfillStreamflowDailyMeans(history, comparison) {
  for (const entry of history.days) {
    const hasFlatDay = comparison.stations.flat?.days?.some((day) => day.date === entry.date);
    const hasLittleDay = comparison.stations.little?.days?.some((day) => day.date === entry.date);
    if (!hasFlatDay && !hasLittleDay) continue;

    const flat = dailyMeanFor(comparison.stations.flat, entry.date);
    const little = dailyMeanFor(comparison.stations.little, entry.date);
    entry.values.streamflow.flat = flat;
    entry.values.streamflow.little = little;
    const unavailableFields = new Set(entry.unavailableFields ?? []);
    for (const [field, value] of [["streamflow.flat", flat], ["streamflow.little", little]]) {
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
