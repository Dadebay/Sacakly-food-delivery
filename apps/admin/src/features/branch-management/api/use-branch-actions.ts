import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  branchQueryKeys,
  type Branch,
  type CreateBranch,
  type UpdateBranch,
} from "@/src/entities/branch";
import { courierQueryKeys } from "@/src/entities/courier";
import { useSession } from "@/src/shared/auth";

export function useBranchActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: branchQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: courierQueryKeys.all }),
    ]);
  };

  const createBranch = useMutation({
    mutationFn: (body: CreateBranch) =>
      authorizedRequest<Branch>("/branches", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  const updateBranch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBranch }) =>
      authorizedRequest<Branch>(`/branches/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });

  return { createBranch, updateBranch };
}
