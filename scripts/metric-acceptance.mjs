function validateMetric(current, next, maxDelta) {
  if (current.observedAt && next.observedAt && new Date(next.observedAt) < new Date(current.observedAt)) {
    throw new Error("Incoming observation is older than the stored verified reading");
  }
  if (
    maxDelta
    && typeof current.value === "number"
    && typeof next.value === "number"
    && Math.abs(next.value - current.value) > maxDelta
  ) {
    throw new Error(`Implausible change exceeded ${maxDelta} ${next.units}`);
  }
}

function applyMetric(current, next, verifiedAt) {
  const isNewObservation = next.observedAt !== current.observedAt;
  const previousValue = isNewObservation ? current.value : current.previousValue;
  Object.assign(current, next, {
    verifiedAt,
    retrievalStatus: "verified",
    validationResult: "accepted",
    previousValue: previousValue ?? null,
    note: next.note,
  });
}

export function acceptMetrics(entries, verifiedAt) {
  for (const { current, next, maxDelta } of entries) {
    validateMetric(current, next, maxDelta);
  }
  for (const { current, next } of entries) {
    applyMetric(current, next, verifiedAt);
  }
}
