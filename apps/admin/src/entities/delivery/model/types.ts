import type { components } from "@alowalow/api-contract";

export type DeliveryConfig = components["schemas"]["DeliveryConfigResponseDto"];
export type DeliveryTariffQuote =
  components["schemas"]["DeliveryTariffQuoteResponseDto"];
export type DeliveryQuote = components["schemas"]["DeliveryQuoteResponseDto"];
export type DeliveryWelayat =
  components["schemas"]["DeliveryWelayatResponseDto"];
export type DeliveryEtrap = components["schemas"]["DeliveryEtrapResponseDto"];
export type DeliveryZonePoint = components["schemas"]["DeliveryZonePointDto"];
export type DeliveryZoneSuggestion =
  components["schemas"]["DeliveryZoneSuggestionResponseDto"];
export type UpdateDeliverySettings =
  components["schemas"]["UpdateDeliverySettingsDto"];
export type CreateDeliveryWelayat =
  components["schemas"]["CreateDeliveryWelayatDto"];
export type UpdateDeliveryWelayat =
  components["schemas"]["UpdateDeliveryWelayatDto"];
export type CreateDeliveryEtrap =
  components["schemas"]["CreateDeliveryEtrapDto"];
export type UpdateDeliveryEtrap =
  components["schemas"]["UpdateDeliveryEtrapDto"];

export type DeliveryEtrapWithWelayat = DeliveryEtrap & {
  welayatNameRu: string;
  welayatNameTk: string;
};

const DELIVERY_ADDRESS_STOP_WORDS = new Set([
  "asgabat",
  "city",
  "district",
  "etrap",
  "etraby",
  "etrapca",
  "koc",
  "kocesi",
  "mkr",
  "nci",
  "nji",
  "njy",
  "pr",
  "prospekt",
  "rayon",
  "rayony",
  "saheri",
  "sayoly",
  "seheri",
  "street",
  "tapgyr",
  "turkmenistan",
  "ul",
]);

function foldDeliveryAddress(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[çÇ]/g, "c")
    .replace(/[ňŇ]/g, "n")
    .replace(/[şŞ]/g, "s")
    .replace(/[ýÝ]/g, "y")
    .toLocaleLowerCase("ru-RU");
}

function significantDeliveryAddressTokens(value: string) {
  return (foldDeliveryAddress(value).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length >= 4 && !DELIVERY_ADDRESS_STOP_WORDS.has(token),
  );
}

export function flattenDeliveryEtraps(
  config: DeliveryConfig | undefined,
): DeliveryEtrapWithWelayat[] {
  return (config?.welayats ?? []).flatMap((welayat) =>
    welayat.etraps.map((etrap) => ({
      ...etrap,
      welayatNameRu: welayat.nameRu,
      welayatNameTk: welayat.nameTk,
    })),
  );
}

/**
 * Suggests a tariff zone only when address text has one unambiguous match.
 * Coordinates are not treated as tariff polygons: ambiguous or numeric-only
 * areas deliberately fall back to explicit staff/customer confirmation.
 */
export function findDeliveryEtrapForAddress(
  config: DeliveryConfig | undefined,
  addressParts: readonly (string | null | undefined)[],
): DeliveryEtrapWithWelayat | null {
  const addressTokens = new Set(
    addressParts.flatMap((part) =>
      part ? significantDeliveryAddressTokens(part) : [],
    ),
  );
  if (!addressTokens.size) return null;

  const matches = flattenDeliveryEtraps(config)
    .map((etrap) => {
      const score = [etrap.nameRu, etrap.nameTk, etrap.nameEn]
        .filter((name): name is string => Boolean(name))
        .reduce((best, name) => {
          const tokens = new Set(significantDeliveryAddressTokens(name));
          const matchedScore = [...tokens].reduce(
            (sum, token) => sum + (addressTokens.has(token) ? token.length : 0),
            0,
          );
          return Math.max(best, matchedScore);
        }, 0);
      return { etrap, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length || matches[0].score === matches[1]?.score) return null;
  return matches[0].etrap;
}

export function deliveryFeeForSubtotal(
  subtotal: number,
  etrap: Pick<DeliveryEtrap, "price" | "freeDeliveryThreshold">,
) {
  return etrap.freeDeliveryThreshold !== null &&
    subtotal >= etrap.freeDeliveryThreshold
    ? 0
    : etrap.price;
}
