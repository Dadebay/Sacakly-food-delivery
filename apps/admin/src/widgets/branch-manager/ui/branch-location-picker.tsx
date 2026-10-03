import { useEffect, useMemo, useRef } from "react";
import { divIcon, type LatLngTuple, type Marker as LeafletMarker } from "leaflet";
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/src/shared/map";
import {
  normalizeBranchCoordinates,
  type BranchCoordinates,
} from "../model/branch-coordinates";

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];

function CoordinateEvents({
  coordinates,
  onChange,
}: {
  coordinates: BranchCoordinates | null;
  onChange: (coordinates: BranchCoordinates) => void;
}) {
  const map = useMapEvents({
    click(event) {
      const nextCoordinates = normalizeBranchCoordinates(
        event.latlng.lat,
        event.latlng.lng,
      );
      if (nextCoordinates) onChange(nextCoordinates);
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

export default function BranchLocationPicker({
  coordinates,
  onChange,
}: {
  coordinates: BranchCoordinates | null;
  onChange: (coordinates: BranchCoordinates) => void;
}) {
  const markerRef = useRef<LeafletMarker>(null);
  const markerIcon = useMemo(
    () =>
      divIcon({
        className: "branch-location-marker",
        html: '<span aria-hidden="true"></span>',
        iconAnchor: [14, 28],
        iconSize: [28, 28],
      }),
    [],
  );
  const center: LatLngTuple = coordinates
    ? [coordinates.latitude, coordinates.longitude]
    : ASHGABAT_CENTER;

  return (
    <section className="branch-location-picker" data-testid="branch-map-picker-root">
      <div className="branch-location-copy">
        <div>
          <strong>Место филиала на карте</strong>
          <small>
            Нажмите на карту, чтобы поставить маркер. Маркер можно перетащить.
          </small>
        </div>
      </div>
      <div data-testid="branch-map-picker">
        <MapContainer
          className="branch-location-map"
          center={center}
          keyboard
          scrollWheelZoom
          zoom={14}
        >
          <TileLayer attribution={MAP_ATTRIBUTION} url={MAP_TILE_URL} />
          <CoordinateEvents coordinates={coordinates} onChange={onChange} />
          {coordinates && (
            <Marker
              draggable
              eventHandlers={{
                dragend() {
                  const point = markerRef.current?.getLatLng();
                  if (!point) return;
                  const nextCoordinates = normalizeBranchCoordinates(
                    point.lat,
                    point.lng,
                  );
                  if (nextCoordinates) onChange(nextCoordinates);
                },
              }}
              icon={markerIcon}
              position={[coordinates.latitude, coordinates.longitude]}
              ref={markerRef}
            >
              <Tooltip direction="top">Филиал</Tooltip>
            </Marker>
          )}
        </MapContainer>
      </div>
    </section>
  );
}
