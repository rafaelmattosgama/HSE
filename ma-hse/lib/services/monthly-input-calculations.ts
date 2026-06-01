function normalizeUnit(unit: string | null) {
  return unit?.trim().toLowerCase() ?? null;
}

export function parseDistanceKm(distanceKm: string | null) {
  if (!distanceKm) return null;

  const normalizedValue = distanceKm.replace(",", ".").replaceAll(" ", "");
  const parsedValue = Number(normalizedValue);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

export function toTons(quantity: number | null, unit: string | null) {
  if (quantity === null || !Number.isFinite(quantity)) {
    return null;
  }

  const normalizedUnit = normalizeUnit(unit);

  if (normalizedUnit === "kg") {
    return quantity / 1000;
  }

  if (normalizedUnit === "ton" || normalizedUnit === "tons" || normalizedUnit === "t" || normalizedUnit === "toneladas") {
    return quantity;
  }

  return null;
}

export function calculateTonKm(quantity: number | null, unit: string | null, distanceKm: string | null) {
  const tons = toTons(quantity, unit);
  const distance = parseDistanceKm(distanceKm);

  if (tons === null || distance === null || distance === 0) {
    return null;
  }

  return Number((tons / distance).toFixed(6));
}

export function calculateTonKmMonths(values: Array<number | null>, unit: string | null, distanceKm: string | null) {
  return values.map((value) => calculateTonKm(value, unit, distanceKm));
}
