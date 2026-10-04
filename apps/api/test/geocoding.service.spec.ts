import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import { districtBoundarySuggestionFromNominatim } from "../src/geocoding/district-boundary";
import { GeocodingService } from "../src/geocoding/geocoding.service";

function config() {
  const values: Partial<AppEnv> = {
    GEOCODING_PRIMARY_URL: "https://nominatim.example.test",
    GEOCODING_FALLBACK_URL: "https://photon.example.test",
    GEOCODING_USER_AGENT: "Saçakly-Tests/1.0",
  };
  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

function internalConfig() {
  const values: Partial<AppEnv> = {
    GEOCODING_PRIMARY_URL: "http://geocoding:8080",
    GEOCODING_FALLBACK_URL: "https://photon.example.test",
    GEOCODING_USER_AGENT: "Saçakly-Tests/1.0",
  };
  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

function jsonResponse(value: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}

describe("geocoding service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches Turkmenistan names explicitly and caches identical requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          lat: "37.95021",
          lon: "58.38021",
          display_name: "Parahat 7, Aşgabat, Türkmenistan",
          namedetails: {
            name: "Parahat 7",
            "name:ru": "Парахат 7",
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    const first = await service.search("  Parahat   7  ", 1);
    const second = await service.search("Parahat 7", 1);

    expect(first).toEqual([
      {
        label: "Parahat 7, Aşgabat, Türkmenistan",
        latitude: 37.95021,
        longitude: 58.38021,
        aliases: ["Parahat 7", "Парахат 7"],
        provider: "NOMINATIM",
      },
    ]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestedUrl, options] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(requestedUrl.hostname).toBe("nominatim.example.test");
    expect(requestedUrl.searchParams.get("q")).toBe("Parahat 7");
    expect(requestedUrl.searchParams.get("countrycodes")).toBe("tm");
    expect(requestedUrl.searchParams.get("namedetails")).toBe("1");
    expect(options.headers).toMatchObject({
      "user-agent": "Saçakly-Tests/1.0",
    });
  });

  it("uses Photon when the primary provider has no matching place", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [58.381, 37.951] },
              properties: {
                name: "Неофициальный ориентир",
                district: "Parahat 7",
                city: "Aşgabat",
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(service.search("ориентир", 3)).resolves.toEqual([
      {
        label: "Неофициальный ориентир, Parahat 7, Aşgabat",
        latitude: 37.951,
        longitude: 58.381,
        aliases: ["Parahat 7", "Aşgabat"],
        provider: "PHOTON",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = fetchMock.mock.calls[1]?.[0] as unknown as URL;
    expect(fallbackUrl.hostname).toBe("photon.example.test");
    expect(fallbackUrl.searchParams.get("bbox")).toBe("52.4,35.1,66.7,42.8");
  });

  it("uses the self-hosted provider without waiting for an unreachable public fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(internalConfig());

    await expect(service.search("Garaşsyzlyk 60", 6)).resolves.toEqual([]);
    await expect(service.reverseGeocode(37.96, 58.32)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [requestedUrl] of fetchMock.mock.calls as unknown as [[URL]]) {
      expect(requestedUrl.hostname).toBe("geocoding");
    }
  });

  it("drops provider results with invalid coordinates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse([
          { lat: "999", lon: "58.3", display_name: "Invalid primary" },
        ]),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            {
              geometry: { coordinates: [999, 37.9] },
              properties: { name: "Invalid fallback" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(service.search("invalid", 3)).resolves.toEqual([]);
  });

  it("suggests localized district names and an editable Nominatim boundary", async () => {
    const ring = Array.from({ length: 80 }, (_, index) => {
      const angle = (index / 80) * Math.PI * 2;
      return [58.32 + Math.cos(angle) * 0.02, 37.96 + Math.sin(angle) * 0.02];
    });
    ring.push(ring[0]!);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        name: "Berkararlyk",
        display_name: "Berkararlyk etraby, Aşgabat, Türkmenistan",
        namedetails: {
          "name:ru": "Беркарарлыкский этрап",
          "name:tk": "Berkararlyk etraby",
          "name:en": "Berkararlyk District",
        },
        address: { city_district: "Berkararlyk" },
        geojson: { type: "Polygon", coordinates: [ring] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    const first = await service.suggestDistrictBoundary(37.96, 58.32);
    const second = await service.suggestDistrictBoundary(37.96, 58.32);

    expect(first).toMatchObject({
      label: "Berkararlyk etraby, Aşgabat, Türkmenistan",
      nameRu: "Беркарарлыкский этрап",
      nameTk: "Berkararlyk etraby",
      nameEn: "Berkararlyk District",
      provider: "NOMINATIM",
    });
    expect(first?.boundary).toHaveLength(64);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchMock.mock.calls[0]?.[0] as unknown as URL;
    expect(requestedUrl.searchParams.get("polygon_geojson")).toBe("1");
    expect(requestedUrl.searchParams.get("namedetails")).toBe("1");
    expect(requestedUrl.searchParams.get("extratags")).toBe("1");
    expect(requestedUrl.searchParams.get("zoom")).toBe("13");
  });

  it("does not offer an Ashgabat etrap outline as an inner tariff zone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        osm_type: "relation",
        osm_id: 8523224,
        display_name: "Bagtyýarlyk etraby, Aşgabat, Türkmenistan",
        namedetails: { "name:ru": "Багтыярлыкский этрап" },
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [58.2, 37.9],
              [58.5, 37.9],
              [58.5, 38.1],
              [58.2, 38.1],
              [58.2, 37.9],
            ],
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(
      service.suggestDistrictBoundary(37.96, 58.32),
    ).resolves.toBeNull();
  });

  it("offers a closed mapped city such as Arkadag as a tariff area", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        osm_type: "relation",
        osm_id: 20087037,
        name: "Arkadag",
        display_name: "Аркадаг, Ахалский велаят, Туркмения",
        namedetails: {
          "name:ru": "Аркадаг",
          "name:tk": "Arkadag",
          "name:en": "Arkadag",
        },
        address: { city: "Аркадаг", state: "Ахалский велаят" },
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [58.02, 38.03],
              [58.11, 38.03],
              [58.11, 38.1],
              [58.02, 38.1],
              [58.02, 38.03],
            ],
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(
      service.suggestDistrictBoundary(38.0664, 58.0669),
    ).resolves.toMatchObject({
      label: "Аркадаг, Ахалский велаят, Туркмения",
      nameRu: "Аркадаг",
      nameTk: "Arkadag",
      boundary: [
        { latitude: 38.03, longitude: 58.02 },
        { latitude: 38.03, longitude: 58.11 },
        { latitude: 38.1, longitude: 58.11 },
        { latitude: 38.1, longitude: 58.02 },
      ],
    });
  });

  it("selects the multipolygon part containing the clicked point", () => {
    const suggestion = districtBoundarySuggestionFromNominatim(
      {
        name: "Test district",
        display_name: "Test district, Aşgabat",
        geojson: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [58, 37],
                [59, 37],
                [59, 38],
                [58, 38],
                [58, 37],
              ],
            ],
            [
              [
                [60, 39],
                [60.1, 39],
                [60.1, 39.1],
                [60, 39.1],
                [60, 39],
              ],
            ],
          ],
        },
      },
      { latitude: 39.05, longitude: 60.05 },
    );

    expect(suggestion?.boundary).toEqual([
      { latitude: 39, longitude: 60 },
      { latitude: 39, longitude: 60.1 },
      { latitude: 39.1, longitude: 60.1 },
      { latitude: 39.1, longitude: 60 },
    ]);
  });

  it("does not flatten a provider polygon with holes into an unsafe tariff zone", () => {
    const suggestion = districtBoundarySuggestionFromNominatim(
      {
        name: "District with an enclave",
        display_name: "District with an enclave, Türkmenistan",
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [58, 37],
              [59, 37],
              [59, 38],
              [58, 38],
              [58, 37],
            ],
            [
              [58.4, 37.4],
              [58.6, 37.4],
              [58.6, 37.6],
              [58.4, 37.6],
              [58.4, 37.4],
            ],
          ],
        },
      },
      { latitude: 37.2, longitude: 58.2 },
    );

    expect(suggestion?.boundary).toBeNull();
  });

  it("does not send district lookup outside Turkmenistan", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new GeocodingService(config());

    await expect(
      service.suggestDistrictBoundary(51.5, -0.1),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
