export function showsStageTwoGuidance(stageValue) {
  return stageValue === 2;
}

export function annualReservoirHeading(year, language) {
  return language === "en"
    ? `See ${year} against each of the prior ten years.`
    : `Compare ${year} con cada uno de los diez años anteriores.`;
}
