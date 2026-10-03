import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { inventoryQueryKeys } from "@/src/entities/inventory";
import { courierQueryKeys } from "@/src/entities/courier";
import { accountingQueryKeys } from "@/src/entities/accounting";
import {
  orderQueryKeys,
  type Order,
  type OrderStatus,
} from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";
import { ApiError } from "@/src/shared/api/api-client";

type TransitionBody = components["schemas"]["TransitionOrderDto"];
type AssignBody = components["schemas"]["AssignCourierDto"];
type AdminEditBody = components["schemas"]["AdminEditOrderDto"];
type ConfirmPackingBody = components["schemas"]["ConfirmOrderPackingDto"];
type CancelBody = components["schemas"]["CancelOrderDto"];
type AdminCompleteBody = components["schemas"]["AdminCompleteOrderDto"];

export function useOrderActions() {
  const queryClient = useQueryClient();
  const { session, authorizedRequest } = useSession();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: courierQueryKeys.all }),
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === inventoryQueryKeys.all[0] && ["stock", "alerts", "movements"].includes(String(query.queryKey[1])) && query.queryKey[2] === session?.user.id }),
    ]);
  };
  const refreshConflict = async (error: Error) => {
    if (error instanceof ApiError && error.status === 409) await refresh();
  };

  const transition = useMutation({
    mutationFn: ({
      orderId,
      status,
      version,
      note,
    }: {
      orderId: string;
      status: OrderStatus;
      version: number;
      note?: string;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/transition`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          version,
          ...(note ? { note } : {}),
        } satisfies TransitionBody),
      }),
    onSuccess: refresh,
  });

  const assignCourier = useMutation({
    mutationFn: ({
      orderId,
      courierId,
      version,
    }: {
      orderId: string;
      courierId: string;
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/assign-courier`, {
        method: "PATCH",
        body: JSON.stringify({ courierId, version } satisfies AssignBody),
      }),
    onSuccess: refresh,
    onError: refreshConflict,
  });

  const confirmPacking = useMutation({
    mutationFn: ({
      orderId,
      checkedItemIds,
      checkedGiftIds,
      version,
    }: {
      orderId: string;
      checkedItemIds: string[];
      checkedGiftIds: string[];
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/confirm-packing`, {
        method: "PATCH",
        body: JSON.stringify({
          checkedItemIds,
          checkedGiftIds,
          version,
        } satisfies ConfirmPackingBody),
      }),
    onSuccess: refresh,
    onError: refreshConflict,
  });

  const adminEdit = useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: AdminEditBody }) =>
      authorizedRequest<Order>(`/orders/${orderId}/admin-edit`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const cancel = useMutation({
    mutationFn: ({
      orderId,
      reason,
      version,
    }: {
      orderId: string;
      reason: string;
      version: number;
    }) =>
      authorizedRequest<Order>(`/orders/${orderId}/cancel`, {
        method: "PATCH",
        body: JSON.stringify({ reason, version } satisfies CancelBody),
      }),
    onSuccess: refresh,
  });

  const adminComplete = useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: AdminCompleteBody }) =>
      authorizedRequest<Order>(`/orders/${orderId}/admin-complete`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: accountingQueryKeys.all }),
      ]);
    },
    onError: refreshConflict,
  });

  return { transition, assignCourier, confirmPacking, adminEdit, cancel, adminComplete };
}
