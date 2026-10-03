import { useQuery } from "@tanstack/react-query";
import { canAccessWebSession, useSession } from "@/src/shared/auth";
import type {
  AdminPageAccessMatrix,
  AdminRolePageAccess,
} from "../model/types";

export const adminPageAccessQueryKeys = {
  all: ["admin-page-access"] as const,
  mine: (role: string) =>
    [...adminPageAccessQueryKeys.all, "mine", role] as const,
  matrix: () => [...adminPageAccessQueryKeys.all, "matrix"] as const,
};

export function useMyAdminPageAccess() {
  const { session, authorizedRequest } = useSession();
  const canLoad = Boolean(session && canAccessWebSession(session.user.role));
  return useQuery({
    queryKey: adminPageAccessQueryKeys.mine(session?.user.role ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<AdminRolePageAccess>("/admin-page-access/me", {
        signal,
      }),
    enabled: canLoad,
    staleTime: 15_000,
  });
}

export function useAdminPageAccessMatrix() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: adminPageAccessQueryKeys.matrix(),
    queryFn: ({ signal }) =>
      authorizedRequest<AdminPageAccessMatrix>("/admin-page-access", {
        signal,
      }),
    enabled: session?.user.role === "SUPER_ADMIN",
    staleTime: 15_000,
  });
}
