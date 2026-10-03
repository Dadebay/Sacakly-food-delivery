# Mobile map and courier routing

The mobile application uses two AlowAlow services for different jobs:

1. TileServer GL renders the shared OpenStreetMap base map.
2. The authenticated NestJS API accepts GPS and returns orders plus a real
   driving route produced by the private OSRM service.

OSRM is never exposed to a phone. It has no authorization or order ownership
context. NestJS is the only routing boundary and returns only the stops assigned
to the authenticated courier.

## Mobile configuration

For a phone in the local Wi-Fi network, replace `192.168.1.20` with the
development Mac's LAN address:

```text
API_BASE_URL=http://192.168.1.20:4000/api/v1
MAP_TILE_URL=http://192.168.1.20:8080/styles/alowalow/{z}/{x}/{y}.png
```

For production, mobile uses the HTTPS API and one simple raster XYZ URL on the
same origin:

```dart
final String apiBaseUrl =
    "https://a7-tagam.com.tm/api/v1";
final String mapApi =
    "https://a7-tagam.com.tm/tile/{z}/{x}/{y}.png";
```

The map SDK replaces `{z}`, `{x}` and `{y}` for every visible tile. No JSON or
`style.json` is required. This is the same raster OpenStreetMap background used
by the React admin and it contains the Turkmenistan regional extract. Areas
outside the extract may render empty. Keep the attribution text
`© OpenStreetMap contributors` visible.

This URL contains only static roads, buildings and labels. Business data stays
in the authenticated NestJS API: courier GPS, branches, customer stops and the
OSRM route are drawn as markers/GeoJSON above the raster background.

## Courier flow

After phone OTP login, the application stores the access and refresh tokens in
platform-secure storage and performs this flow:

```text
GPS -> PUT /tracking/me/location -> Redis latest point
                                  -> authorized dispatch SSE
                                  -> live admin map marker

GET /orders/courier/route
  -> current courier point
  -> each unique pickup branch for orders not picked up yet
  -> all assigned delivery stops in assignment order
  -> private OSRM driving graph
  -> GeoJSON LineString + distance + duration + legs + maneuvers
```

Location update:

```http
PUT /api/v1/tracking/me/location
Authorization: Bearer <courier-access-token>
Content-Type: application/json

{
  "latitude": 37.9601,
  "longitude": 58.3261,
  "accuracy": 12,
  "heading": 95,
  "speed": 8.5,
  "recordedAt": "2026-08-02T16:00:00.000Z"
}
```

During the complete courier shift, including gaps between orders and after an
order becomes `DELIVERED`, publish a fresh point about every 10–15 seconds
(subject to Android/iOS background and battery rules). The API returns
`nextUpdateInSeconds=15`. Delivery completion changes the dispatch workload
label to `Свободен` but must not stop GPS. Every accepted point is pushed to the
dispatch map immediately; a two-minute mobile interval would still make the
visible marker two minutes stale even though SSE itself is live. Stop sharing
only when the courier explicitly ends the shift.

Route request:

```http
GET /api/v1/orders/courier/route
Authorization: Bearer <courier-access-token>
```

`stops` always contains the courier's active assigned orders. When
`routingStatus` is `READY`, `route.geometry` is a GeoJSON `LineString` whose
coordinate pairs are `[longitude, latitude]`; render it as a polyline above the
PNG tile layer. `route.waypoints` identifies courier, pickup, and delivery points.
`route.nextWaypoints` is the next one to three actionable pickup/delivery
points, while `stops` still contains every active order; mobile must never hide
the remaining assigned work. `route.planId` fingerprints the ordered inputs and
road geometry. The admin and the courier receive the same `planId`, stops and
GeoJSON for the same current GPS/order state.
`route.legs` contains distance, duration and normalized turn maneuvers between
adjacent waypoints.

If the routing process is temporarily unavailable, the API returns
`routingStatus=UNAVAILABLE`, `route=null`, and keeps `stops`. The application
must still show every address and marker. `NO_STOPS` means no active assignment.

Refresh the road route after an assignment/status change and no later than
`recalculateAfterSeconds` while delivery is active. Every accepted GPS event
invalidates the selected courier route in the admin, so a changed direction,
detour or U-turn produces a new route from the latest position. Mobile should
also refresh after publishing GPS, subject to the returned 15-second
recommendation. GPS publishing and route fetching remain separate authenticated
operations, and the backend remains the only owner of stop ordering.

The dispatcher uses this endpoint for the selected courier:

```http
GET /api/v1/orders/couriers/{courierId}/route
Authorization: Bearer <operator-or-admin-access-token>
```

It returns the same response schema as the courier endpoint. Customers and
couriers cannot request another courier's dispatcher route.

## Road closures and live traffic

The current self-hosted OpenStreetMap extract and OSRM graph do not contain a
live traffic or temporary road-closure feed. Rerouting from fresh GPS adapts
when the courier actually takes another road, but OSRM may still propose an
unreported newly closed road. Do not label the current ETA as live-traffic ETA.

Supporting closures before the courier reaches them requires a separate trusted
source of dynamic restrictions, for example an operator-managed closure layer
or a licensed traffic provider, and a routing engine/configuration that applies
those restrictions. That future source must be ingested on the backend so web
and mobile still receive one authoritative `planId` and route.

The customer phone/address, live courier coordinates, and order markers come
only from authenticated API responses. TileServer receives none of this data.
