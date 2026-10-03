import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { Branch } from "../model/types";

export const branchQueryKeys = {
  all: ["branches"] as const,
  list: (userId: string) => [...branchQueryKeys.all, "list", userId] as const,
};

export function useBranches() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: branchQueryKeys.list(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Branch[]>("/branches", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}
