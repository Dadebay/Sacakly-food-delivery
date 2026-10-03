import { useEffect, useMemo, useRef, useState } from "react";
import {
  divIcon,
  type LatLngTuple,
  type Marker as LeafletMarker,
} from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/src/shared/map";

export type DeliveryCoordinates = {
  latitude: number;
  longitude: number;
};

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];

function normalized(latitude: number, longitude: number) {
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  };
}

function MapResizeController() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const resize = () => map.invalidateSize({ animate: false });
    const frame = window.requestAnimationFrame(resize);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

function MapEvents({
  coordinates,
  onChange,
}: {
  coordinates: DeliveryCoordinates | null;
  onChange: (coordinates: DeliveryCoordinates) => void;
}) {
  const map = useMapEvents({
    click(event) {
      onChange(normalized(event.latlng.lat, event.latlng.lng));
    },
  });
  useEffect(() => {
    if (!coordinates) return;
    map.setView([coordinates.latitude, coordinates.longitude], map.getZoom(), {
      animate: false,
    });
  }, [coordinates, map]);
  return null;
}

export function DeliveryLocationPicker({
  coordinates,
  onChange,
}: {
  coordinates: DeliveryCoordinates | null;
  onChange: (coordinates: DeliveryCoordinates) => void;
}) {
  const markerRef = useRef<LeafletMarker>(null);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const markerIcon = useMemo(
    () =>
      divIcon({
        className: "assisted-order-marker",
        html: '<span aria-hidden="true"></span>',
        iconAnchor: [15, 30],
        iconSize: [30, 30],
      }),
    [],
  );
  const center: LatLngTuple = coordinates
    ? [coordinates.latitude, coordinates.longitude]
    : ASHGABAT_CENTER;

  return (
    <div
      className="assisted-order-map-wrap"
      data-testid="delivery-location-map"
    >
      <MapContainer
        className="assisted-order-map"
        center={center}
        keyboard
        scrollWheelZoom
        zoom={14}
      >
        <TileLayer
          attribution={MAP_ATTRIBUTION}
          eventHandlers={{
            load: () => setMapStatus("ready"),
            loading: () => setMapStatus("loading"),
            tileerror: () => setMapStatus("error"),
          }}
          url={MAP_TILE_URL}
        />
        <MapResizeController />
        <MapEvents coordinates={coordinates} onChange={onChange} />
        {coordinates && (
          <Marker
            draggable
            eventHandlers={{
              add(event) {
                event.target
                  .getElement()
                  ?.setAttribute("aria-label", "Адрес доставки");
              },
              dragend() {
                const point = markerRef.current?.getLatLng();
                if (point) onChange(normalized(point.lat, point.lng));
              },
            }}
            icon={markerIcon}
            position={[coordinates.latitude, coordinates.longitude]}
            ref={markerRef}
            title="Адрес доставки"
          >
            <Tooltip direction="top">Адрес доставки</Tooltip>
          </Marker>
        )}
      </MapContainer>
      <div className="assisted-map-instruction">
        Нажмите на карту или перетащите маркер в точное место
      </div>
      <div
        className={`assisted-map-status ${mapStatus}`}
        data-testid="delivery-location-map-status"
        role="status"
      >
        {mapStatus === "loading" && "Карта загружается…"}
        {mapStatus === "ready" && "Карта готова"}
        {mapStatus === "error" && "Не удалось загрузить слой карты"}
      </div>
    </div>
  );
}
