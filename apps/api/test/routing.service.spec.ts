import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import {
  RoutingService,
  RoutingUnavailableError,
} from "../src/routing/routing.service";

function makeService(timeoutMs = 100) {
  return new RoutingService({
    get: vi.fn((key: keyof AppEnv) =>
      key === "ROUTING_URL" ? "http://routing.test:5000" : timeoutMs,
    ),
  } as unknown as ConfigService<AppEnv, true>);
}

const osrmResponse = {
  code: "Ok",
  waypoints: [
    { location: [58.382, 37.95], distance: 2.5 },
    { location: [58.39, 37.94], distance: 4 },
  ],
  routes: [
    {
      distance: 1_250,
      duration: 240,
      geometry: {
        type: "LineString",
        coordinates: [
          [58.382, 37.95],
          [58.39, 37.94],
        ],
      },
      legs: [
        {
          distance: 1_250,
          duration: 240,
          summary: "Bitarap Turkmenistan sayoly",
          steps: [
            {
              distance: 1_250,
              duration: 240,
              name: "Bitarap Turkmenistan sayoly",
              mode: "driving",
              maneuver: {
                type: "depart",
                modifier: "right",
                location: [58.382, 37.95],
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("RoutingService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests longitude-latitude OSRM geometry and normalizes directions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(osrmResponse),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await makeService().planDrivingRoute([
      { latitude: 37.95, longitude: 58.382 },
      { latitude: 37.94, longitude: 58.39 },
    ]);

    const requested = fetchMock.mock.calls[0][0] as URL;
    expect(requested.pathname).toBe(
      "/route/v1/driving/58.382,37.95;58.39,37.94",
    );
    expect(requested.searchParams.get("geometries")).toBe("geojson");
    expect(requested.searchParams.get("steps")).toBe("true");
    expect(result).toMatchObject({
      distanceMeters: 1_250,
      durationSeconds: 240,
      geometry: { type: "LineString" },
      waypoints: [
        { latitude: 37.95, longitude: 58.382, distanceToRoadMeters: 2.5 },
        { latitude: 37.94, longitude: 58.39, distanceToRoadMeters: 4 },
      ],
      legs: [
        {
          steps: [
            {
              roadName: "Bitarap Turkmenistan sayoly",
              maneuver: { type: "depart", modifier: "right" },
            },
          ],
        },
      ],
    });
  });

  it("hides provider errors and malformed responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ code: "NoRoute", routes: [] }),
      }),
    );

    await expect(
      makeService().planDrivingRoute([
        { latitude: 37.95, longitude: 58.382 },
        { latitude: 37.94, longitude: 58.39 },
      ]),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
  });

  it("aborts a slow provider request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: URL, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
      ),
    );

    await expect(
      makeService(5).planDrivingRoute([
        { latitude: 37.95, longitude: 58.382 },
        { latitude: 37.94, longitude: 58.39 },
      ]),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
  });

  it("rejects invalid or excessive point collections without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = makeService();

    await expect(
      service.planDrivingRoute([{ latitude: 37.95, longitude: 58.382 }]),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
    await expect(
      service.planDrivingRoute([
        { latitude: 91, longitude: 58.382 },
        { latitude: 37.94, longitude: 58.39 },
      ]),
    ).rejects.toBeInstanceOf(RoutingUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
