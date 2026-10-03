import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { NotificationCampaignList } from "../model/types";

export const notificationQueryKeys = {
  all: ["notification-campaigns"] as const,
  list: (userId: string, page: number) =>
    [...notificationQueryKeys.all, "list", userId, page] as const,
};

export function useNotificationCampaigns(page: number) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: notificationQueryKeys.list(session?.user.id ?? "anonymous", page),
    queryFn: ({ signal }) =>
      authorizedRequest<NotificationCampaignList>(
        `/notifications/admin/campaigns?page=${page}&limit=25`,
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 15_000,
    refetchInterval: (query) =>
      query.state.data?.items.some(({ status }) =>
        ["PENDING", "SENDING"].includes(status),
      )
        ? 3_000
        : false,
  });
}
