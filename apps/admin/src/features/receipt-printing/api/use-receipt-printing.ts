import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useSession } from "@/src/shared/auth";

export const RECEIPT_PRINT_AGENT_URL = (
  import.meta.env.VITE_RECEIPT_PRINT_AGENT_URL ?? "http://127.0.0.1:17873"
).replace(/\/+$/, "");
export const receiptQueueKey = ["receipt-print-queue"] as const;

export function useReceiptPrinting() {
  const { authorizedRequest, session } = useSession();
  const queryClient = useQueryClient();
  const pendingKeys = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: async (
      request:
        | string
        | {
            orderId: string;
            mainCopies?: number;
            itemRoutes: components["schemas"]["ReceiptItemRouteDto"][];
          },
    ) => {
      const orderId = typeof request === "string" ? request : request.orderId;
      const storageKey = `receipt-reprint:${session?.user.id}:${orderId}`;
      let key = pendingKeys.current.get(storageKey);
      try {
        key ??= window.sessionStorage.getItem(storageKey) ?? undefined;
      } catch {
        /* Memory retains in-page retries. */
      }
      key ??= crypto.randomUUID();
      pendingKeys.current.set(storageKey, key);
      try {
        window.sessionStorage.setItem(storageKey, key);
      } catch {
        /* Storage can be disabled. */
      }
      const task = await authorizedRequest<
        components["schemas"]["ReceiptTaskResponseDto"]
      >(`/receipt-print-tasks/orders/${orderId}/reprint`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: key,
          ...(typeof request === "string"
            ? {}
            : { itemRoutes: request.itemRoutes, mainCopies: request.mainCopies }),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      pendingKeys.current.delete(storageKey);
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {
        /* No queue state is kept here. */
      }
      return task;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: receiptQueueKey }),
    retry: false,
  });
}
