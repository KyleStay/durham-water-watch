function numberFrom(text, expression, label) {
  const match = text.match(expression);
  if (!match) throw new Error(`${label} did not parse`);
  const value = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new Error(`${label} was not numeric`);
  return value;
}

export function parseSupplyValues(section) {
  const accessible = numberFrom(
    section,
    /(?:premium|easily accessible) water remaining[^:\d]*:\s*(\d+(?:\.\d+)?)/i,
    "Accessible supply",
  );
  const belowIntakes = numberFrom(
    section,
    /below the intake structures remaining[^:\d]*:\s*(\d+(?:\.\d+)?)/i,
    "Below-intake supply",
  );
  const quarry = numberFrom(
    section,
    /Teer Quarry[^:\d]*:\s*(\d+(?:\.\d+)?)/i,
    "Teer Quarry supply",
  );
  const total = numberFrom(
    section,
    /Total days of supply[^:\d]*:\s*(\d+(?:\.\d+)?)/i,
    "Total supply",
  );

  if ([accessible, belowIntakes, quarry, total].some((value) => value < 0)) {
    throw new Error("Days-of-supply components must be nonnegative");
  }
  if (Math.abs(accessible + belowIntakes + quarry - total) > 1) {
    throw new Error("Official total is inconsistent with its displayed components");
  }

  return { accessible, belowIntakes, quarry, total };
}
