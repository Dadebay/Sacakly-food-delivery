import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  appVersionQueryKeys,
  updateVersionCache,
  type AppPlatform,
  type AppVersion,
  type SaveAppVersion,
} from "@/src/entities/app-version";
import { useSession } from "@/src/shared/auth";

export function useSaveAppVersion() {
  const { session, authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      platform,
      body,
    }: {
      platform: AppPlatform;
      body: SaveAppVersion;
    }) =>
      authorizedRequest<AppVersion>(`/app/admin/versions/${platform}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onMutate: () =>
      queryClient.cancelQueries({
        queryKey: appVersionQueryKeys.admin(session?.user.id ?? "anonymous"),
        exact: true,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData<AppVersion[]>(
        appVersionQueryKeys.admin(session?.user.id ?? "anonymous"),
        (current) => updateVersionCache(current, saved),
      );
    },
  });
}
