import { describe, expect, it } from "vitest";
import { findDeliveryAreaForAddress } from "../src/delivery/delivery-area-matcher";

const candidates = [
  { id: 1, nameRu: "Беркарарлыкский", nameTk: "Berkararlyk", nameEn: null },
  { id: 2, nameRu: "Копетдагский", nameTk: "Köpetdag", nameEn: "Kopetdag" },
];

describe("delivery area matcher", () => {
  it("matches the etrap named by reverse geocoding", () => {
    expect(
      findDeliveryAreaForAddress(
        candidates,
        "Kemine köçesi, Berkararlyk etraby, Aşgabat şäheri",
      )?.id,
    ).toBe(1);
  });

  it("folds Turkmen diacritics", () => {
    expect(findDeliveryAreaForAddress(candidates, "Kopetdag etraby")?.id).toBe(
      2,
    );
  });

  it("prefers the area with more matching name tokens", () => {
    const howdanCandidates = [
      { id: 74, nameRu: "Гаудан А", nameTk: "Howdan A", nameEn: null },
      { id: 75, nameRu: "Гаудан Б", nameTk: "Howdan B", nameEn: null },
      { id: 76, nameRu: "Гаудан В", nameTk: "Howdan W", nameEn: null },
      ...candidates,
    ];

    expect(
      findDeliveryAreaForAddress(howdanCandidates, "Köpetdag etraby, Howdan W")
        ?.id,
    ).toBe(76);
  });

  it("uses a one-letter suffix only to disambiguate a meaningful area name", () => {
    const howdanCandidates = [
      { id: 74, nameRu: "Гаудан А", nameTk: "Howdan A", nameEn: null },
      { id: 75, nameRu: "Гаудан Б", nameTk: "Howdan B", nameEn: null },
      { id: 76, nameRu: "Гаудан В", nameTk: "Howdan W", nameEn: null },
    ];

    expect(findDeliveryAreaForAddress(howdanCandidates, "W")).toBeNull();
    expect(findDeliveryAreaForAddress(howdanCandidates, "Howdan")).toBeNull();
  });

  it("uses a unique shorter alphabetic prefix when no exact token matches", () => {
    expect(
      findDeliveryAreaForAddress(
        [
          candidates[0],
          {
            id: 57,
            nameRu: "пр. Нейтралитета (Подвойского)",
            nameTk: "Bitaraplyk köç. (Podwoýskogo)",
            nameEn: null,
          },
        ],
        "Köpetdag etraby, Bitarap Türkmenistan (2002) şaýoly",
      )?.id,
    ).toBe(57);
  });

  it("prefers an exact token over a prefix variant", () => {
    expect(
      findDeliveryAreaForAddress(
        [
          ...candidates,
          { id: 3, nameRu: "Другой", nameTk: "Bitarap", nameEn: null },
          {
            id: 4,
            nameRu: "Ещё один",
            nameTk: "Bitaraplyk",
            nameEn: null,
          },
        ],
        "Bitarap Türkmenistan şaýoly",
      )?.id,
    ).toBe(3);
  });

  it("rejects ambiguous prefix variants", () => {
    expect(
      findDeliveryAreaForAddress(
        [
          {
            id: 3,
            nameRu: "Первый",
            nameTk: "Bitaraplyk",
            nameEn: null,
          },
          {
            id: 4,
            nameRu: "Второй",
            nameTk: "Bitaraplar",
            nameEn: null,
          },
        ],
        "Bitarap Türkmenistan şaýoly",
      ),
    ).toBeNull();
  });

  it("matches numbered stages without treating a house number as an area", () => {
    const numberedCandidates = [
      {
        id: 37,
        nameRu: "14 этап (Совхозная)",
        nameTk: "14-nji tapgyr (Sowhoznaýa)",
        nameEn: null,
      },
      {
        id: 38,
        nameRu: "15 этап (ул. Молланепеса, Сейди)",
        nameTk: "15-nji tapgyr (Mollanepes, Seýdi)",
        nameEn: null,
      },
      {
        id: 48,
        nameRu: "21 мкр",
        nameTk: "21-nji etrapça",
        nameEn: "21 Microdistrict",
      },
    ];

    expect(
      findDeliveryAreaForAddress(
        numberedCandidates,
        "Köpetdag etraby, 14-nji Nobatdaky, Gurbannazar Ezizow köçesi 21",
      )?.id,
    ).toBe(37);
    expect(
      findDeliveryAreaForAddress(
        numberedCandidates,
        "15-nji Nobatdaky, Tähran (2070) köçesi",
      )?.id,
    ).toBe(38);
    expect(
      findDeliveryAreaForAddress(
        numberedCandidates,
        "Gurbannazar Ezizow köçesi 21",
      ),
    ).toBeNull();
  });

  it("rejects unknown and ambiguous area text", () => {
    expect(findDeliveryAreaForAddress(candidates, "Kemine köçesi")).toBeNull();
    expect(
      findDeliveryAreaForAddress(
        [
          ...candidates,
          { id: 3, nameRu: "Другой", nameTk: "Köpetdag", nameEn: null },
          {
            id: 4,
            nameRu: "Третий",
            nameTk: "Köpetdagly",
            nameEn: null,
          },
        ],
        "Köpetdag etraby",
      ),
    ).toBeNull();
  });
});
