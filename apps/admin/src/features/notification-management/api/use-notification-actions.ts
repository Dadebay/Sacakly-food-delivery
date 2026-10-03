import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  notificationQueryKeys,
  type CreateNotificationCampaign,
  type NotificationCampaign,
} from "@/src/entities/notification";
import { useSession } from "@/src/shared/auth";

export function useNotificationActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all });

  const create = useMutation({
    mutationFn: (body: CreateNotificationCampaign) =>
      authorizedRequest<NotificationCampaign>(
        "/notifications/admin/campaigns",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<NotificationCampaign>(
        `/notifications/admin/campaigns/${id}/retry`,
        { method: "POST" },
      ),
    onSuccess: refresh,
  });

  return { create, retry };
}
