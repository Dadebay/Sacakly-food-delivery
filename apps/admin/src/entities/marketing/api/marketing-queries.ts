import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { Banner, Promo } from "../model/types";

export const marketingQueryKeys = {
  all: ["marketing"] as const,
  banners: (userId: string) =>
    [...marketingQueryKeys.all, "banners", userId] as const,
  promos: (userId: string) =>
    [...marketingQueryKeys.all, "promos", userId] as const,
};

export function useAdminBanners() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: marketingQueryKeys.banners(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Banner[]>("/marketing/admin/banners", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useAdminPromos() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: marketingQueryKeys.promos(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Promo[]>("/marketing/promos", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}
