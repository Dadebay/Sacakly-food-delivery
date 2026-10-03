export type RoutingPoint = {
  latitude: number;
  longitude: number;
};

export type RoutedWaypoint = {
  latitude: number;
  longitude: number;
  distanceToRoadMeters: number;
};

export type RouteStep = {
  distanceMeters: number;
  durationSeconds: number;
  roadName: string;
  mode: string;
  maneuver: {
    type: string;
    modifier: string | null;
    latitude: number;
    longitude: number;
  };
};

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
  summary: string;
  steps: RouteStep[];
};

export type PlannedRoadRoute = {
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  waypoints: RoutedWaypoint[];
  legs: RouteLeg[];
};
