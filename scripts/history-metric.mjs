export function acceptedMetricObservation(metric) {
  if (metric?.validationResult !== "accepted") return null;
  if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) return null;
  if (typeof metric.observedAt !== "string") return null;
  return {
    value: metric.value,
    observedAt: metric.observedAt,
    verifiedAt: metric.verifiedAt,
    sourceUrl: metric.sourceUrl,
  };
}
