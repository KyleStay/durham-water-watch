const HOUR = 3_600_000;

function easternDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return NaN;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

/** @returns {'fresh' | 'stale' | 'unavailable'} */
export function metricStatus(metric, kind, now = Date.now()) {
  if (metric?.value === null || metric?.value === undefined) return 'unavailable';
  if (metric.retrievalStatus === 'failed' || metric.validationResult === 'rejected') return 'stale';
  const stamp = kind === 'stage' ? metric.verifiedAt : metric.observedAt;
  const observed = Date.parse(stamp);
  const current = new Date(now).getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(current) || observed > current) return 'stale';
  if (kind === 'stage' || kind === 'usgs') {
    return current - observed > (kind === 'stage' ? 48 : 3) * HOUR ? 'stale' : 'fresh';
  }
  // Date-only City readings are local calendar dates, not UTC instants.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(stamp) ? Date.parse(`${stamp}T00:00:00Z`) : easternDay(stamp);
  return (easternDay(current) - day) / (24 * HOUR) > (kind === 'durham' ? 2 : 9) ? 'stale' : 'fresh';
}

export function dashboardAt(snapshot, now) {
  const age = (metric, kind) => ({ ...metric, status: metricStatus(metric, kind, now) });
  const group = (metrics, kind) => Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, age(metric, kind)]));
  return {
    ...snapshot, stage: age(snapshot.stage, 'stage'), drought: age(snapshot.drought, 'drought'),
    supply: group(snapshot.supply, 'durham'), reservoirs: group(snapshot.reservoirs, 'durham'),
    streamflow: group(snapshot.streamflow, 'usgs'),
  };
}
