import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { AppVersion } from "../model/types";

export const appVersionQueryKeys = {
  all: ["app-versions"] as const,
  admin: (userId: string) => ["app-versions", "admin", userId] as const,
};

export function useAppVersions() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: appVersionQueryKeys.admin(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<AppVersion[]>("/app/admin/versions", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
}
