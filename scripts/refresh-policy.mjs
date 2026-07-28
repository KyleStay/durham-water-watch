export function metricNeedsRetry(metric) {
  return metric?.status === "stale"
    || metric?.retrievalStatus === "failed"
    || metric?.validationResult === "rejected";
}

export function sourceIsDue({ forceAll = false, metrics = [], elapsed, interval }) {
  return forceAll
    || metrics.some(metricNeedsRetry)
    || !Number.isFinite(elapsed)
    || elapsed >= interval;
}
