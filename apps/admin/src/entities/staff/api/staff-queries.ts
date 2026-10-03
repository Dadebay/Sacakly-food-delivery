import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { RecentLogin, Staff } from "../model/types";

export const staffQueryKeys = {
  all: ["staff"] as const,
  list: (userId: string) => [...staffQueryKeys.all, "list", userId] as const,
  recentLogins: (userId: string) =>
    [...staffQueryKeys.all, "recent-logins", userId] as const,
};

export function useStaff() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: staffQueryKeys.list(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Staff[]>("/staff", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useRecentLogins() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: staffQueryKeys.recentLogins(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<RecentLogin[]>("/staff/recent-logins", { signal }),
    enabled: Boolean(session),
    staleTime: 15_000,
  });
}
