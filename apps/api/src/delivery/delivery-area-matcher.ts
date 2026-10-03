const DELIVERY_ADDRESS_STOP_WORDS = new Set([
  "asgabat",
  "city",
  "district",
  "etap",
  "etrap",
  "etraby",
  "etrapca",
  "koc",
  "kocesi",
  "mkr",
  "microdistrict",
  "mikrorayon",
  "nci",
  "nji",
  "njy",
  "nobatdaky",
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
  "этап",
]);

export type DeliveryAreaCandidate = {
  id: number;
  nameRu: string;
  nameTk: string;
  nameEn: string | null;
};

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
  const folded = foldDeliveryAddress(value);
  const canonicalTokens: string[] = [];
  const numberedAreaPatterns = [
    {
      kind: "stage",
      pattern:
        /(\d{1,3})(?:\s*-\s*[\p{L}]{2,6})?\s+(?:nobatdaky|tapgyr|etap|этап)(?=$|[^\p{L}\p{N}])/gu,
    },
    {
      kind: "microdistrict",
      pattern:
        /(\d{1,3})(?:\s*-\s*[\p{L}]{2,6})?\s+(?:etrapca|mkr|microdistrict|mikrorayon|мкр|микрорайон)(?=$|[^\p{L}\p{N}])/gu,
    },
  ];
  for (const { kind, pattern } of numberedAreaPatterns) {
    for (const match of folded.matchAll(pattern)) {
      canonicalTokens.push(`${kind}:${Number(match[1])}`);
    }
  }

  return [
    ...(folded.match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (token) =>
        (token.length >= 4 || /^\p{L}$/u.test(token)) &&
        !DELIVERY_ADDRESS_STOP_WORDS.has(token),
    ),
    ...canonicalTokens,
  ];
}

type DeliveryAreaMatchScore = {
  matchedTokenCount: number;
  matchedCharacterCount: number;
};

function isMeaningfulDeliveryToken(token: string) {
  return token.length >= 4 || token.includes(":");
}

function scoreDeliveryAreaName(
  addressTokens: ReadonlySet<string>,
  name: string,
  matches: (addressToken: string, candidateToken: string) => boolean,
) {
  const matchedTokens = [
    ...new Set(significantDeliveryAddressTokens(name)),
  ].flatMap((token) => {
    const matchedLength = [...addressTokens].reduce(
      (best, addressToken) =>
        matches(addressToken, token)
          ? Math.max(best, Math.min(token.length, addressToken.length))
          : best,
      0,
    );
    return matchedLength ? [{ token, matchedLength }] : [];
  });

  // A one-letter suffix such as W/A/B may disambiguate a matched area name,
  // but must never identify an area by itself.
  if (!matchedTokens.some(({ token }) => isMeaningfulDeliveryToken(token))) {
    return { matchedTokenCount: 0, matchedCharacterCount: 0 };
  }

  return {
    matchedTokenCount: matchedTokens.length,
    matchedCharacterCount: matchedTokens.reduce(
      (total, { matchedLength }) => total + matchedLength,
      0,
    ),
  };
}

function compareDeliveryAreaMatchScores(
  left: DeliveryAreaMatchScore,
  right: DeliveryAreaMatchScore,
) {
  return (
    left.matchedTokenCount - right.matchedTokenCount ||
    left.matchedCharacterCount - right.matchedCharacterCount
  );
}

function rankDeliveryAreas<T extends DeliveryAreaCandidate>(
  candidates: readonly T[],
  addressTokens: ReadonlySet<string>,
  matches: (addressToken: string, candidateToken: string) => boolean,
) {
  return candidates
    .map((candidate) => ({
      candidate,
      score: [candidate.nameRu, candidate.nameTk, candidate.nameEn]
        .filter((name): name is string => Boolean(name))
        .reduce(
          (best, name) => {
            const score = scoreDeliveryAreaName(addressTokens, name, matches);
            return compareDeliveryAreaMatchScores(score, best) > 0
              ? score
              : best;
          },
          { matchedTokenCount: 0, matchedCharacterCount: 0 },
        ),
    }))
    .filter(({ score }) => score.matchedTokenCount > 0)
    .sort((left, right) =>
      compareDeliveryAreaMatchScores(right.score, left.score),
    );
}

function selectUnambiguousDeliveryArea<T>(
  ranked: readonly { candidate: T; score: DeliveryAreaMatchScore }[],
) {
  const best = ranked[0];
  if (
    !best ||
    (ranked[1] &&
      compareDeliveryAreaMatchScores(best.score, ranked[1].score) === 0)
  ) {
    return null;
  }
  return best.candidate;
}

function isDeliveryTokenPrefixVariant(left: string, right: string) {
  if (left === right || !/^\p{L}+$/u.test(left) || !/^\p{L}+$/u.test(right)) {
    return false;
  }
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

/**
 * Matches only an unambiguous configured area name. Exact normalized tokens
 * always win. When there is no exact match, a unique alphabetic prefix variant
 * such as `bitarap` / `bitaraplyk` is accepted. Coordinates are not treated as
 * polygons: unresolved or ambiguous addresses keep the fallback quote.
 */
export function findDeliveryAreaForAddress<T extends DeliveryAreaCandidate>(
  candidates: readonly T[],
  addressLine: string | null,
): T | null {
  if (!addressLine) return null;
  const addressTokens = new Set(significantDeliveryAddressTokens(addressLine));
  if (!addressTokens.size) return null;

  const exactMatches = rankDeliveryAreas(
    candidates,
    addressTokens,
    (addressToken, candidateToken) => addressToken === candidateToken,
  );
  if (exactMatches.length) {
    return selectUnambiguousDeliveryArea(exactMatches);
  }

  return selectUnambiguousDeliveryArea(
    rankDeliveryAreas(candidates, addressTokens, isDeliveryTokenPrefixVariant),
  );
}
