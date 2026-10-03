import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deliveryQueryKeys,
  type CreateDeliveryEtrap,
  type CreateDeliveryWelayat,
  type DeliveryEtrap,
  type DeliveryWelayat,
  type DeliveryZonePoint,
  type DeliveryZoneSuggestion,
  type UpdateDeliveryEtrap,
  type UpdateDeliverySettings,
  type UpdateDeliveryWelayat,
} from "@/src/entities/delivery";
import { useSession } from "@/src/shared/auth";

export function useDeliveryActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: deliveryQueryKeys.all });

  const updateSettings = useMutation({
    mutationFn: (body: UpdateDeliverySettings) =>
      authorizedRequest("/delivery/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const createWelayat = useMutation({
    mutationFn: (body: CreateDeliveryWelayat) =>
      authorizedRequest<DeliveryWelayat>("/delivery/admin/welayats", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const updateWelayat = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateDeliveryWelayat }) =>
      authorizedRequest<DeliveryWelayat>(`/delivery/admin/welayats/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const createEtrap = useMutation({
    mutationFn: (body: CreateDeliveryEtrap) =>
      authorizedRequest<DeliveryEtrap>("/delivery/admin/etraps", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const updateEtrap = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateDeliveryEtrap }) =>
      authorizedRequest<DeliveryEtrap>(`/delivery/admin/etraps/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const suggestZone = useMutation({
    mutationFn: (body: DeliveryZonePoint) =>
      authorizedRequest<DeliveryZoneSuggestion>(
        "/delivery/admin/zone-suggestion",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
  });

  return {
    updateSettings,
    createWelayat,
    updateWelayat,
    createEtrap,
    updateEtrap,
    suggestZone,
  };
}
