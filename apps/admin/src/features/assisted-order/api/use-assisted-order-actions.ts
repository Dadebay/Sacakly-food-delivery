import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@sacakly/api-contract";
import { orderQueryKeys, type Order } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";

export type CreateAssistedOrderBody =
  components["schemas"]["CreateAssistedOrderDto"];

export function useAssistedOrderActions() {
  const queryClient = useQueryClient();
  const { authorizedRequest } = useSession();

  const pending = useRef<{ body: string; key: string } | null>(null);
  const create = useMutation({
    mutationFn: async (body: CreateAssistedOrderBody) => {
      const fingerprint = JSON.stringify(body);
      if (pending.current?.body !== fingerprint)
        pending.current = { body: fingerprint, key: crypto.randomUUID() };
      const order = await authorizedRequest<Order>("/orders/assisted", {
        method: "POST",
        body: JSON.stringify({ ...body, idempotencyKey: pending.current.key }),
        signal: AbortSignal.timeout(20_000),
      });
      pending.current = null;
      return order;
    },
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all }),
  });

  return { create };
}
