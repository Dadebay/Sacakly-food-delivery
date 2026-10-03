import { quoteBoundaryDelay } from "../model/quote-validity";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import type {
  DeliveryConfig,
  DeliveryQuote,
  DeliveryTariffQuote,
} from "../model/types";

export const deliveryQueryKeys = {
  all: ["delivery"] as const,
  publicConfig: () => [...deliveryQueryKeys.all, "public-config"] as const,
  adminConfig: (userId: string) =>
    [...deliveryQueryKeys.all, "admin-config", userId] as const,
  tariffQuote: (etrapId: number | null, subtotal: number) =>
    [...deliveryQueryKeys.all, "tariff-quote", etrapId, subtotal] as const,
  quote: (
    latitude: number | null,
    longitude: number | null,
    subtotal: number,
  ) =>
    [...deliveryQueryKeys.all, "quote", latitude, longitude, subtotal] as const,
};

export function useDeliveryConfig() {
  return useQuery({
    queryKey: deliveryQueryKeys.publicConfig(),
    queryFn: ({ signal }) =>
      apiRequest<DeliveryConfig>("/delivery/config", { signal }),
    staleTime: 5 * 60_000,
  });
}

export function useDeliveryQuote(
  latitude: number | null,
  longitude: number | null,
  subtotal: number,
  enabled = true,
) {
  return useQuery({
    queryKey: deliveryQueryKeys.quote(latitude, longitude, subtotal),
    queryFn: ({ signal }) =>
      apiRequest<DeliveryQuote>("/delivery/quote", {
        method: "POST",
        body: JSON.stringify({ latitude, longitude, subtotal }),
        signal,
      }),
    enabled: enabled && latitude !== null && longitude !== null,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : quoteBoundaryDelay(query.state.data?.validUntil),
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function useAdminDeliveryConfig() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: deliveryQueryKeys.adminConfig(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<DeliveryConfig>("/delivery/admin/config", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useDeliveryTariffQuote(
  etrapId: number | null,
  subtotal: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: deliveryQueryKeys.tariffQuote(etrapId, subtotal),
    queryFn: ({ signal }) =>
      apiRequest<DeliveryTariffQuote>("/delivery/tariff-quote", {
        method: "POST",
        body: JSON.stringify({ deliveryEtrapId: etrapId, subtotal }),
        signal,
      }),
    enabled,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.status === "error"
        ? false
        : quoteBoundaryDelay(query.state.data?.validUntil),
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
