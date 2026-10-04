import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { components } from "@sacakly/api-contract";
import { useSession } from "@/src/shared/auth";
import {
  courierLocationErrorMessage,
  startCourierLocationFeed,
  stopCourierLocationSession,
  toCourierLocationInput,
  type CourierLocationInput,
} from "../model/location-sharing";

type LocationResponse =
  components["schemas"]["UpdateCourierLocationResponseDto"];

export function CourierLocationSharing() {
  const { authorizedRequest } = useSession();
  const [sharing, setSharing] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const publishPending = useRef(false);
  const pendingPublish = useRef<Promise<unknown> | null>(null);
  const stopFeed = useRef<(() => void) | null>(null);

  const {
    mutateAsync: publishLocation,
    error: publishError,
  } = useMutation({
    mutationFn: (location: CourierLocationInput) =>
      authorizedRequest<LocationResponse>("/tracking/me/location", {
        method: "PUT",
        body: JSON.stringify(location),
      }),
    onSuccess: (response) => {
      setLastSentAt(response.location.receivedAt);
      setGeoError("");
    },
  });

  const publish = useCallback(
    async (position: GeolocationPosition) => {
      if (publishPending.current) return;
      publishPending.current = true;
      const request = publishLocation(toCourierLocationInput(position));
      pendingPublish.current = request;
      try {
        await request;
      } catch {
        // TanStack Mutation exposes the normalized API error in the UI.
      } finally {
        if (pendingPublish.current === request) pendingPublish.current = null;
        publishPending.current = false;
      }
    },
    [publishLocation],
  );

  useEffect(() => {
    if (!sharing) return;

    const onError = (error: GeolocationPositionError) => {
      setGeoError(courierLocationErrorMessage(error.code));
    };
    const stop = startCourierLocationFeed({
      geolocation: navigator.geolocation,
      intervals: window,
      publish: (position) => void publish(position),
      reportError: onError,
    });
    stopFeed.current = stop;
    return () => {
      stop();
      if (stopFeed.current === stop) stopFeed.current = null;
    };
  }, [publish, sharing]);

  async function stopSharing() {
    const currentStopFeed = stopFeed.current;
    stopFeed.current = null;
    setSharing(false);
    await stopCourierLocationSession({
      stopFeed: currentStopFeed,
      pendingPublish: pendingPublish.current,
      clearLocation: () =>
        authorizedRequest("/tracking/me/location", {
          method: "DELETE",
        }).catch(() => undefined),
    });
  }

  const mutationError =
    publishError instanceof Error ? publishError.message : "";

  return (
    <section
      className="courier-sharing-card"
      data-testid="courier-location-sharing"
    >
      <div className="sharing-status">
        <span className={sharing ? "sharing-dot active" : "sharing-dot"} />
        <div>
          <strong>
            {sharing ? "Геолокация передаётся" : "Геолокация выключена"}
          </strong>
          <p>
            {sharing
              ? "Новая точка отправляется диспетчеру каждые 15 секунд, даже без активного заказа."
              : "Включите геолокацию в начале смены и выключите после её завершения."}
          </p>
        </div>
      </div>
      {lastSentAt && (
        <p className="last-location">
          Последнее обновление:{" "}
          {new Intl.DateTimeFormat("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date(lastSentAt))}
        </p>
      )}
      {(geoError || mutationError) && (
        <p className="form-error">{geoError || mutationError}</p>
      )}
      {sharing ? (
        <button
          className="secondary-button"
          data-testid="courier-location-sharing-stop"
          type="button"
          onClick={() => void stopSharing()}
        >
          Завершить смену и убрать себя с карты
        </button>
      ) : (
        <button
          className="primary-button"
          data-testid="courier-location-sharing-start"
          type="button"
          onClick={() => {
            setGeoError("");
            if (!("geolocation" in navigator)) {
              setGeoError("Этот браузер не поддерживает геолокацию.");
              return;
            }
            setSharing(true);
          }}
        >
          Начать смену и показать себя на карте
        </button>
      )}
      <small>
        Не выключайте геолокацию после доставки: свободный курьер должен
        оставаться виден диспетчеру. Мобильный браузер может приостанавливать GPS
        после блокировки экрана.
      </small>
    </section>
  );
}
