import type { components } from "@sacakly/api-contract";

export type CourierLocationInput =
  components["schemas"]["UpdateCourierLocationDto"];

export const COURIER_LOCATION_UPDATE_INTERVAL_MS = 15_000;

export const COURIER_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20_000,
  maximumAge: 90_000,
};

type GeolocationPort = Pick<
  Geolocation,
  "watchPosition" | "clearWatch" | "getCurrentPosition"
>;

type IntervalPort = {
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(intervalId: number): void;
};

type CourierLocationFeedOptions = {
  geolocation: GeolocationPort;
  intervals: IntervalPort;
  publish(position: GeolocationPosition): void;
  reportError(error: GeolocationPositionError): void;
};

type StopCourierLocationSessionOptions = {
  stopFeed: (() => void) | null;
  pendingPublish: Promise<unknown> | null;
  clearLocation(): Promise<unknown>;
};

export function toCourierLocationInput(
  position: GeolocationPosition,
): CourierLocationInput {
  const { coords } = position;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    ...(Number.isFinite(coords.accuracy)
      ? { accuracy: coords.accuracy }
      : {}),
    ...(coords.heading !== null && Number.isFinite(coords.heading)
      ? { heading: coords.heading }
      : {}),
    ...(coords.speed !== null && Number.isFinite(coords.speed)
      ? { speed: coords.speed }
      : {}),
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

export function courierLocationErrorMessage(errorCode: number) {
  return errorCode === 1
    ? "Доступ к геолокации запрещён. Разрешите его в настройках браузера."
    : "Не удалось получить свежую GPS-точку.";
}

export async function stopCourierLocationSession({
  stopFeed,
  pendingPublish,
  clearLocation,
}: StopCourierLocationSessionOptions) {
  stopFeed?.();
  await pendingPublish?.catch(() => undefined);
  await clearLocation();
}

export function startCourierLocationFeed({
  geolocation,
  intervals,
  publish,
  reportError,
}: CourierLocationFeedOptions) {
  let active = true;
  let firstReadingSent = false;
  const publishIfActive = (position: GeolocationPosition) => {
    if (active) publish(position);
  };
  const reportIfActive = (error: GeolocationPositionError) => {
    if (active) reportError(error);
  };
  const onInitialPosition = (position: GeolocationPosition) => {
    if (!active || firstReadingSent) return;
    firstReadingSent = true;
    publishIfActive(position);
  };
  const watchId = geolocation.watchPosition(
    onInitialPosition,
    reportIfActive,
    COURIER_LOCATION_OPTIONS,
  );
  const intervalId = intervals.setInterval(() => {
    if (!active) return;
    geolocation.getCurrentPosition(
      publishIfActive,
      reportIfActive,
      COURIER_LOCATION_OPTIONS,
    );
  }, COURIER_LOCATION_UPDATE_INTERVAL_MS);

  return () => {
    if (!active) return;
    active = false;
    geolocation.clearWatch(watchId);
    intervals.clearInterval(intervalId);
  };
}
