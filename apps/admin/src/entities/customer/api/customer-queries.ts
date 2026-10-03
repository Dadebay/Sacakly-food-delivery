import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { AssistedCustomerList } from "../model/types";

export const customerQueryKeys = {
  all: ["customers"] as const,
  assistedSearch: (userId: string, phone: string) =>
    [...customerQueryKeys.all, "assisted-search", userId, phone] as const,
};

export function useAssistedCustomerSearch() {
  const queryClient = useQueryClient();
  const { session, authorizedRequest } = useSession();
  return useMutation({
    mutationFn: (phone: string) => {
      const normalized = phone.trim();
      if (!session) throw new Error("Требуется авторизация");
      const query = new URLSearchParams({ phone: normalized, limit: "10" });
      return queryClient.fetchQuery({
        queryKey: customerQueryKeys.assistedSearch(session.user.id, normalized),
        queryFn: ({ signal }) =>
          authorizedRequest<AssistedCustomerList>(
            `/orders/assisted/customers?${query}`,
            { signal },
          ),
        staleTime: 30_000,
      });
    },
  });
}
