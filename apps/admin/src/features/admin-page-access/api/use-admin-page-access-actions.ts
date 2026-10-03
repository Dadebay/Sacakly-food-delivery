import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminPageAccessQueryKeys,
  type AdminRolePageAccess,
  type UpdateAdminPageAccess,
} from "@/src/entities/admin-page-access";
import { useSession } from "@/src/shared/auth";

export function useAdminPageAccessActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();

  const updateRoleAccess = useMutation({
    mutationFn: ({
      role,
      body,
    }: {
      role: string;
      body: UpdateAdminPageAccess;
    }) =>
      authorizedRequest<AdminRolePageAccess>(`/admin-page-access/${role}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminPageAccessQueryKeys.all,
      });
    },
  });

  return { updateRoleAccess };
}
