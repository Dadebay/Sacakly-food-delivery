import { Fragment, useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  divIcon,
  type LatLngBoundsExpression,
  type LatLngTuple,
} from "leaflet";
import { MAP_ATTRIBUTION, MAP_TILE_URL } from "@/src/shared/map";
import { brandColors } from "@/src/shared/ui";
import {
  courierMapLocations,
  courierName,
  courierRouteColor,
  courierWorkLabel,
} from "../model/courier-status";
import type {
  CourierRouteOverlay,
  DispatchBranchDto,
  DispatchCourier,
} from "../model/map-types";

const ASHGABAT_CENTER: LatLngTuple = [37.9601, 58.3261];
function FitMap({ points, scope }: { points: LatLngTuple[]; scope: string }) {
  const map = useMap();
  const fittedScope = useRef<string | null>(null);
  useEffect(() => {
    // Live GPS must move markers without undoing the dispatcher's pan/zoom.
    if (!points.length || fittedScope.current === scope) return;
    fittedScope.current = scope;
    if (points.length === 1) map.setView(points[0], 14, { animate: false });
    else
      map.fitBounds(points as LatLngBoundsExpression, {
        padding: [40, 40],
        maxZoom: 15,
        animate: false,
      });
  }, [map, points, scope]);
  useEffect(() => {
    const observer = new ResizeObserver(() =>
      map.invalidateSize({ pan: false }),
    );
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function CourierMarkers({
  couriers,
  allCouriers,
  selectedCourierId,
  onSelectCourier,
}: {
  couriers: DispatchCourier[];
  allCouriers: DispatchCourier[];
  selectedCourierId: string | null;
  onSelectCourier: (id: string) => void;
}) {
  return courierMapLocations(couriers).map(
    ({ courier, latitude, longitude }) => {
      const number = allCouriers.findIndex(({ id }) => id === courier.id) + 1;
      const color = courierRouteColor(number - 1);
      return (
        <Marker
          key={courier.id}
          position={[latitude, longitude]}
          title={courierName(courier)}
          alt={courierName(courier)}
          icon={divIcon({
            className: `dispatch-map-pin ${courier.presence.toLowerCase()}`,
            html: `<span data-testid="dispatch-map-courier-${courier.id}" style="background:${color}">${number}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          })}
          eventHandlers={{ click: () => onSelectCourier(courier.id) }}
        >
          <Tooltip
            direction="top"
            offset={[0, -16]}
            permanent={courier.id === selectedCourierId}
          >
            <strong>{courierName(courier)}</strong>
            <br />
            {courierWorkLabel(courier)}
          </Tooltip>
        </Marker>
      );
    },
  );
}

export default function CourierMapCanvas({
  branches,
  couriers,
  allCouriers,
  selectedCourierId,
  routes,
  showStops,
  fitRevision,
  onSelectCourier,
}: {
  branches: DispatchBranchDto[];
  couriers: DispatchCourier[];
  allCouriers: DispatchCourier[];
  selectedCourierId: string | null;
  routes: CourierRouteOverlay[];
  showStops: boolean;
  fitRevision: number;
  onSelectCourier: (id: string) => void;
}) {
  const stopGroups = showStops
    ? couriers.map((courier) => ({
        courier,
        color: courierRouteColor(
          allCouriers.findIndex(({ id }) => id === courier.id),
        ),
        // Snapshot is the current order authority; an older route must not resurrect completed stops.
        stops: courier.activeOrders,
      }))
    : [];
  const routeLines = routes.flatMap(({ color, courier, route }) =>
    route.routingStatus === "READY" && route.route
      ? [
          {
            color,
            courier,
            points: route.route.geometry.coordinates.map(
              ([longitude, latitude]) =>
                [latitude, longitude] satisfies LatLngTuple,
            ),
          },
        ]
      : [],
  );
  const points: LatLngTuple[] = routeLines.flatMap(({ points }) => points);
  const courierLocations = courierMapLocations(couriers);
  for (const location of courierLocations)
    points.push([location.latitude, location.longitude]);
  const visibleBranches = selectedCourierId
    ? branches.filter((branch) =>
        couriers.some((courier) =>
          courier.activeOrders.some((order) => order.branch?.id === branch.id),
        ),
      )
    : branches;
  for (const branch of visibleBranches)
    points.push([branch.latitude, branch.longitude]);
  for (const { stops } of stopGroups)
    for (const order of stops) {
      points.push([order.latitude, order.longitude]);
      if (order.branch?.latitude != null && order.branch.longitude != null)
        points.push([order.branch.latitude, order.branch.longitude]);
    }
  return (
    <MapContainer
      className="courier-map-canvas"
      center={points[0] ?? ASHGABAT_CENTER}
      zoom={13}
      scrollWheelZoom
      zoomControl
      data-testid="dispatch-courier-map"
    >
      <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} />
      <FitMap
        points={points}
        scope={`${selectedCourierId ?? "all"}:${fitRevision}:${showStops}:${routeLines.length > 0}`}
      />
      {routeLines.map(({ color, courier, points: line }) => (
        <Fragment key={courier.id}>
          <Polyline
            positions={line}
            interactive={false}
            pathOptions={{
              color: brandColors.cream,
              weight: 7,
              opacity: 0.85,
              interactive: false,
            }}
          />
          <Polyline
            positions={line}
            className="dispatch-road-route"
            pathOptions={{
              color,
              weight: 4,
              opacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelectCourier(courier.id) }}
          >
            <Tooltip sticky>{courierName(courier)}</Tooltip>
          </Polyline>
        </Fragment>
      ))}
      {visibleBranches.map((branch) => (
        <CircleMarker
          key={branch.id}
          center={[branch.latitude, branch.longitude]}
          radius={7}
          pathOptions={{
            color: brandColors.orange,
            fillColor: brandColors.cream,
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Tooltip direction="top">Филиал · {branch.name}</Tooltip>
          <Popup>
            <strong>Филиал · {branch.name}</strong>
            <br />
            {branch.address}
          </Popup>
        </CircleMarker>
      ))}
      {stopGroups.flatMap(({ color, courier, stops }) =>
        stops.map((order) => (
          <CircleMarker
            key={order.id}
            center={[order.latitude, order.longitude]}
            radius={6}
            pathOptions={{
              color,
              fillColor: brandColors.cream,
              fillOpacity: 1,
              weight: 3,
            }}
            eventHandlers={{ click: () => onSelectCourier(courier.id) }}
          >
            <Tooltip
              permanent
              direction="right"
              className="dispatch-order-label"
            >
              <span style={{ color }}>#{order.number}</span>
            </Tooltip>
            <Popup>
              <strong>Заказ #{order.number}</strong>
              <br />
              {order.address}
              <br />
              {courierName(courier)}
            </Popup>
          </CircleMarker>
        )),
      )}
      <CourierMarkers
        couriers={couriers}
        allCouriers={allCouriers}
        selectedCourierId={selectedCourierId}
        onSelectCourier={onSelectCourier}
      />
    </MapContainer>
  );
}
