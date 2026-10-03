import { useEffect, useMemo, useRef, useState } from "react";
import {
  divIcon,
  type LatLngBoundsExpression,
  type LatLngTuple,
} from "leaflet";
import {
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type {
  DeliveryEtrapWithWelayat,
  DeliveryZonePoint,
} from "@/src/entities/delivery";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/src/shared/map";
import {
  insertDeliveryZonePointAtNearestEdge,
  replaceDeliveryZonePoint,
  scaleDeliveryZone,
} from "../model/delivery-zone-editor";

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];

function normalized(latitude: number, longitude: number): DeliveryZonePoint {
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

function FitZones({
  points,
  revision,
}: {
  points: readonly DeliveryZonePoint[];
  revision: number;
}) {
  const map = useMap();
  const fittedRevision = useRef<number | null>(null);
  const signature = points
    .map(({ latitude, longitude }) => `${latitude}:${longitude}`)
    .join("|");
  useEffect(() => {
    if (!points.length || fittedRevision.current === revision) return;
    fittedRevision.current = revision;
    if (points.length === 1) {
      map.setView([points[0]!.latitude, points[0]!.longitude], 14, {
        animate: false,
      });
      return;
    }
    const bounds = points.map(
      ({ latitude, longitude }) => [latitude, longitude] as LatLngTuple,
    ) as LatLngBoundsExpression;
    map.fitBounds(bounds, { animate: false, padding: [24, 24], maxZoom: 15 });
    // `signature` deliberately represents the coordinates without retaining a
    // new array identity on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, revision, signature]);
  return null;
}

function MapClickCollector({
  editable,
  discovering,
  onAppend,
  onDiscover,
}: {
  editable: boolean;
  discovering: boolean;
  onAppend?: (point: DeliveryZonePoint) => void;
  onDiscover?: (point: DeliveryZonePoint) => void;
}) {
  useMapEvents({
    click(event) {
      const point = normalized(event.latlng.lat, event.latlng.lng);
      if (discovering) onDiscover?.(point);
      else if (editable) onAppend?.(point);
    },
  });
  return null;
}

function coordinates(points: readonly DeliveryZonePoint[]): LatLngTuple[] {
  return points.map(({ latitude, longitude }) => [latitude, longitude]);
}

export function DeliveryZoneMap({
  zones,
  draft = [],
  editable = false,
  selectedId = null,
  onDraftChange,
  onSelect,
  discoveryMode = false,
  fitRevision = 0,
  onDiscover,
}: {
  zones: readonly DeliveryEtrapWithWelayat[];
  draft?: readonly DeliveryZonePoint[];
  editable?: boolean;
  selectedId?: number | null;
  onDraftChange?: (points: DeliveryZonePoint[]) => void;
  onSelect?: (etrap: DeliveryEtrapWithWelayat) => void;
  discoveryMode?: boolean;
  fitRevision?: number;
  onDiscover?: (point: DeliveryZonePoint) => void;
}) {
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const zoned = useMemo(
    () => zones.filter((zone) => (zone.deliveryZone?.length ?? 0) >= 3),
    [zones],
  );
  const fitPoints = useMemo(
    () =>
      draft.length
        ? [...draft]
        : zoned.flatMap((zone) => zone.deliveryZone ?? []),
    [draft, zoned],
  );
  const draftIcons = useMemo(
    () =>
      draft.map((_point, index) =>
        divIcon({
          className: "delivery-zone-vertex-icon",
          html: `<span aria-label="Перетащить точку ${index + 1}" data-testid="delivery-zone-map-point-${index + 1}" role="button">${index + 1}</span>`,
          iconAnchor: [14, 14],
          iconSize: [28, 28],
        }),
      ),
    [draft],
  );

  return (
    <section
      className={`delivery-zone-map-shell${editable ? " is-editable" : ""}`}
      data-testid="delivery-zone-map"
    >
      <div className="delivery-zone-map-canvas">
        <MapContainer
          center={ASHGABAT_CENTER}
          className={`delivery-zone-map-leaflet${
            discoveryMode ? " is-discovering" : ""
          }`}
          keyboard
          scrollWheelZoom
          zoom={11}
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
          <FitZones points={fitPoints} revision={fitRevision} />
          <MapClickCollector
            discovering={discoveryMode}
            editable={editable && draft.length < 64}
            onAppend={(point) =>
              onDraftChange?.(
                insertDeliveryZonePointAtNearestEdge(draft, point),
              )
            }
            onDiscover={onDiscover}
          />
          {zoned.map((zone) => {
            const selected = zone.id === selectedId;
            return (
              <Polygon
                eventHandlers={{
                  click(event) {
                    event.originalEvent.stopPropagation();
                    onSelect?.(zone);
                  },
                }}
                key={zone.id}
                pathOptions={{
                  color: selected ? "#062f5e" : "#ec7a1b",
                  fillColor: selected ? "#f7c66d" : "#fef7e7",
                  fillOpacity: selected ? 0.42 : 0.28,
                  weight: selected ? 4 : 2,
                }}
                positions={coordinates(zone.deliveryZone ?? [])}
              >
                <Tooltip sticky>
                  <strong>{zone.nameRu}</strong>
                  <br />
                  {zone.price.toFixed(2)} TMT
                </Tooltip>
              </Polygon>
            );
          })}
          {draft.length >= 3 && (
            <Polygon
              pathOptions={{
                color: "#062f5e",
                dashArray: "7 6",
                fillColor: "#f7c66d",
                fillOpacity: 0.38,
                weight: 3,
              }}
              positions={coordinates(draft)}
            />
          )}
          {draft.map((point, index) => (
            <Marker
              alt={`Точка границы ${index + 1}`}
              draggable={editable && !discoveryMode}
              eventHandlers={{
                dragend(event) {
                  const position = event.target.getLatLng();
                  onDraftChange?.(
                    replaceDeliveryZonePoint(
                      draft,
                      index,
                      normalized(position.lat, position.lng),
                    ),
                  );
                },
              }}
              icon={draftIcons[index]}
              key={`${point.latitude}:${point.longitude}:${index}`}
              position={[point.latitude, point.longitude]}
              riseOnHover
              title={`Перетащить точку ${index + 1}`}
            >
              <Tooltip direction="top">Точка {index + 1}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {editable && (
        <div className="delivery-zone-map-tools">
          <div>
            <strong data-testid="delivery-zone-map-point-count">
              {draft.length} точек
            </strong>
            <span>
              Перетаскивайте пронумерованные точки. Клик рядом со стороной
              добавит туда новую точку. Минимум 3 точки, максимум 64.
            </span>
          </div>
          <div className="row-actions">
            <button
              className="secondary-button compact"
              data-testid="delivery-zone-map-shrink"
              disabled={draft.length < 3}
              onClick={() => onDraftChange?.(scaleDeliveryZone(draft, 0.8))}
              type="button"
            >
              Уменьшить
            </button>
            <button
              className="secondary-button compact"
              data-testid="delivery-zone-map-grow"
              disabled={draft.length < 3}
              onClick={() => onDraftChange?.(scaleDeliveryZone(draft, 1.25))}
              type="button"
            >
              Увеличить
            </button>
            <button
              className="secondary-button compact"
              data-testid="delivery-zone-map-undo"
              disabled={!draft.length}
              onClick={() => onDraftChange?.(draft.slice(0, -1))}
              type="button"
            >
              Отменить точку
            </button>
            <button
              className="text-button compact"
              data-testid="delivery-zone-map-clear"
              disabled={!draft.length}
              onClick={() => onDraftChange?.([])}
              type="button"
            >
              Очистить границу
            </button>
          </div>
        </div>
      )}

      <div
        className={`assisted-map-status ${mapStatus}`}
        data-testid="delivery-zone-map-status"
        role="status"
      >
        {mapStatus === "loading" && "Карта зон загружается…"}
        {mapStatus === "ready" && "Карта зон готова"}
        {mapStatus === "error" && "Не удалось загрузить слой карты"}
      </div>
    </section>
  );
}
