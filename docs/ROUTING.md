# Saçakly road routing

This isolated service builds real driving routes from the Turkmenistan
OpenStreetMap extract. TileServer GL in `maps/` draws the base map; OSRM here
calculates road geometry, distance, duration, legs, and turn maneuvers.

```bash
npm run routing:up
```

The first run downloads the regional Geofabrik PBF and preprocesses it with the
car profile and the MLD pipeline. Source downloads and generated routing graphs
stay ignored under `routing/runtime/`. Updates are built in a temporary
directory and replace the active graph only after all preprocessing succeeds.
The current Turkmenistan runtime data occupies about 192 MB. Local measurement
after startup was about 97 MB RAM; preprocessing peaked near 558 MB, so the
container is capped at 768 MB while the graph builder needs that temporary
headroom.

OSRM listens only on `127.0.0.1:5000`. It is infrastructure, not a public API.
Courier applications call authenticated NestJS
`GET /api/v1/orders/courier/route`; NestJS combines the courier's current Redis
GPS point, unique branch pickup points, and assigned delivery points, then
returns normalized GeoJSON and directions. If OSRM is unavailable, assigned
stops remain available with `routingStatus=UNAVAILABLE`.

```bash
npm run routing:update  # refresh OSM data atomically and restart OSRM
npm run routing:down    # stop only OSRM
```
