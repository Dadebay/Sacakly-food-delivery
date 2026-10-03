import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  GeocodeSearchResponse,
  ReverseGeocodeResponse,
} from "../model/types";

export const geocodingQueryKeys = {
  all: ["geocoding"] as const,
  search: (query: string) =>
    [...geocodingQueryKeys.all, "search", query] as const,
  reverse: (latitude: number | null, longitude: number | null) =>
    [...geocodingQueryKeys.all, "reverse", latitude, longitude] as const,
};

export function useGeocodeSearch(query: string) {
  const { session, authorizedRequest } = useSession();
  const normalized = query.trim();
  return useQuery({
    queryKey: geocodingQueryKeys.search(normalized),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: normalized, limit: "6" });
      return authorizedRequest<GeocodeSearchResponse>(
        `/geocoding/search?${params}`,
        { signal },
      );
    },
    enabled: Boolean(session && normalized.length >= 3),
    staleTime: 24 * 60 * 60 * 1_000,
    gcTime: 24 * 60 * 60 * 1_000,
    retry: 1,
  });
}

export function useReverseGeocode(
  latitude: number | null,
  longitude: number | null,
) {
  const { authorizedRequest } = useSession();
  return useQuery({
    queryKey: geocodingQueryKeys.reverse(latitude, longitude),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
      });
      return authorizedRequest<ReverseGeocodeResponse>(
        `/geocoding/reverse?${params}`,
        { signal },
      );
    },
    enabled: latitude !== null && longitude !== null,
    staleTime: 24 * 60 * 60 * 1_000,
    retry: 1,
  });
}
