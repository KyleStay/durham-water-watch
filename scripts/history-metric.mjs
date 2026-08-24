export function freshMetricValue(metric) {
  if (metric?.status !== "fresh" || metric?.validationResult === "rejected") return null;
  return metric.value ?? null;
}
