export type DistancePriceTier = {
  afterKilometers: number;
  dayPricePerKilometer: number;
  nightPricePerKilometer: number;
};

/** Validate stored JSON as well as writes; invalid tariffs must never be priced. */
export function parseDistancePriceTiers(value: unknown): DistancePriceTier[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new RangeError("Specify at most 20 distance price tiers");
  }
  let previous = 0;
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RangeError("Invalid distance price tier");
    }
    const tier = item as Record<string, unknown>;
    for (const key of [
      "afterKilometers",
      "dayPricePerKilometer",
      "nightPricePerKilometer",
    ]) {
      const number = tier[key];
      if (
        typeof number !== "number" ||
        !Number.isFinite(number) ||
        number < 0.01 ||
        number > 10_000 ||
        Math.abs(number * 100 - Math.round(number * 100)) > 1e-8
      ) {
        throw new RangeError(
          "Tier distances and prices must be 0.01–10000 with at most two decimals",
        );
      }
    }
    const { afterKilometers, dayPricePerKilometer, nightPricePerKilometer } =
      tier as DistancePriceTier;
    if (afterKilometers <= previous) {
      throw new RangeError(
        "Distance thresholds must be unique and in ascending order",
      );
    }
    previous = afterKilometers;
    return { afterKilometers, dayPricePerKilometer, nightPricePerKilometer };
  });
}
