const DEFAULT_TILE_URL = "/tile/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = "© OpenStreetMap contributors";

function configuredValue(value: string | undefined, fallback: string) {
  const configured = value?.trim();
  return configured || fallback;
}

export const MAP_TILE_URL = configuredValue(
  import.meta.env.VITE_MAP_TILE_URL,
  DEFAULT_TILE_URL,
);

export const MAP_ATTRIBUTION = configuredValue(
  import.meta.env.VITE_MAP_ATTRIBUTION,
  DEFAULT_ATTRIBUTION,
);
