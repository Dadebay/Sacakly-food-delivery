import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { Gift } from "../model/types";

export const loyaltyQueryKeys = {
  all: ["loyalty"] as const,
  adminGifts: (userId: string) => ["loyalty", "admin-gifts", userId] as const,
};

export function useAdminGifts() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: loyaltyQueryKeys.adminGifts(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) => authorizedRequest<Gift[]>("/loyalty/admin/gifts", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}
