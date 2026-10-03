import { describe, expect, it } from "vitest";
import {
  availableCatalogSlug,
  catalogSlug,
} from "../src/catalog/catalog-slug";

describe("catalog slug generation", () => {
  it("generates stable identifiers from Russian and Turkmen names", () => {
    expect(catalogSlug("Борщ с говядиной", 180)).toBe(
      "borshch-s-govyadinoy",
    );
    expect(catalogSlug("Şaşlyk we gök önümler", 180)).toBe(
      "saslyk-we-gok-onumler",
    );
  });

  it("uses a bounded fallback and appends a collision suffix", () => {
    expect(catalogSlug("🥘", 120)).toBe("item");
    expect(
      availableCatalogSlug(
        "borshch",
        ["borshch", "borshch-2", "borshch-4"],
        120,
      ),
    ).toBe("borshch-3");
    expect(
      availableCatalogSlug("abcdefghij", ["abcdefghij"], 10),
    ).toBe("abcdefgh-2");
  });
});
