import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../config/env";
import type {
  PlannedRoadRoute,
  RouteLeg,
  RouteStep,
  RoutedWaypoint,
  RoutingPoint,
} from "./routing.types";

const MAX_ROUTE_POINTS = 50;

export class RoutingUnavailableError extends Error {
  constructor() {
    super("Road routing is temporarily unavailable");
    this.name = "RoutingUnavailableError";
  }
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppEnv, true>) {
    this.baseUrl = config.get("ROUTING_URL", { infer: true });
    this.timeoutMs = config.get("ROUTING_TIMEOUT_MS", { infer: true });
  }

  async planDrivingRoute(points: RoutingPoint[]): Promise<PlannedRoadRoute> {
    if (points.length < 2 || points.length > MAX_ROUTE_POINTS) {
      throw new RoutingUnavailableError();
    }
    if (
      points.some(
        ({ latitude, longitude }) =>
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180,
      )
    ) {
      throw new RoutingUnavailableError();
    }

    const coordinates = points
      .map(({ latitude, longitude }) => `${longitude},${latitude}`)
      .join(";");
    const url = new URL(
      `/route/v1/driving/${coordinates}`,
      `${this.baseUrl}/`,
    );
    url.searchParams.set("steps", "true");
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");
    url.searchParams.set("annotations", "false");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new RoutingUnavailableError();
      return this.parseResponse(await response.json(), points.length);
    } catch (error) {
      if (!(error instanceof RoutingUnavailableError)) {
        this.logger.warn("Road routing provider request failed");
      }
      throw new RoutingUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(value: unknown, expectedWaypoints: number) {
    if (!isRecord(value) || value.code !== "Ok") {
      throw new RoutingUnavailableError();
    }
    const routes: unknown[] = Array.isArray(value.routes)
      ? (value.routes as unknown[])
      : [];
    const route: unknown = routes[0];
    const waypoints: unknown[] = Array.isArray(value.waypoints)
      ? (value.waypoints as unknown[])
      : [];
    if (
      !isRecord(route) ||
      !isFiniteNumber(route.distance) ||
      !isFiniteNumber(route.duration) ||
      !isLineString(route.geometry) ||
      !Array.isArray(route.legs) ||
      route.legs.length !== expectedWaypoints - 1 ||
      waypoints.length !== expectedWaypoints
    ) {
      throw new RoutingUnavailableError();
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: {
        type: "LineString" as const,
        coordinates: route.geometry.coordinates,
      },
      waypoints: waypoints.map((waypoint) => this.parseWaypoint(waypoint)),
      legs: route.legs.map((leg) => this.parseLeg(leg)),
    } satisfies PlannedRoadRoute;
  }

  private parseWaypoint(value: unknown): RoutedWaypoint {
    if (
      !isRecord(value) ||
      !isCoordinate(value.location) ||
      !isFiniteNumber(value.distance)
    ) {
      throw new RoutingUnavailableError();
    }
    return {
      longitude: value.location[0],
      latitude: value.location[1],
      distanceToRoadMeters: value.distance,
    };
  }

  private parseLeg(value: unknown): RouteLeg {
    if (
      !isRecord(value) ||
      !isFiniteNumber(value.distance) ||
      !isFiniteNumber(value.duration) ||
      typeof value.summary !== "string" ||
      !Array.isArray(value.steps)
    ) {
      throw new RoutingUnavailableError();
    }
    return {
      distanceMeters: value.distance,
      durationSeconds: value.duration,
      summary: value.summary,
      steps: value.steps.map((step) => this.parseStep(step)),
    };
  }

  private parseStep(value: unknown): RouteStep {
    if (
      !isRecord(value) ||
      !isFiniteNumber(value.distance) ||
      !isFiniteNumber(value.duration) ||
      typeof value.name !== "string" ||
      typeof value.mode !== "string" ||
      !isRecord(value.maneuver) ||
      typeof value.maneuver.type !== "string" ||
      !isCoordinate(value.maneuver.location) ||
      !(
        value.maneuver.modifier === undefined ||
        typeof value.maneuver.modifier === "string"
      )
    ) {
      throw new RoutingUnavailableError();
    }
    return {
      distanceMeters: value.distance,
      durationSeconds: value.duration,
      roadName: value.name,
      mode: value.mode,
      maneuver: {
        type: value.maneuver.type,
        modifier: value.maneuver.modifier ?? null,
        longitude: value.maneuver.location[0],
        latitude: value.maneuver.location[1],
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function isLineString(
  value: unknown,
): value is { type: "LineString"; coordinates: number[][] } {
  return (
    isRecord(value) &&
    value.type === "LineString" &&
    Array.isArray(value.coordinates) &&
    value.coordinates.length >= 2 &&
    value.coordinates.every(isCoordinate)
  );
}
