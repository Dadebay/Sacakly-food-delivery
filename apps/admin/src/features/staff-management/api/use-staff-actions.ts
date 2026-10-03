import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  staffQueryKeys,
  type CreateStaff,
  type StaffMutation,
  type UpdateStaff,
} from "@/src/entities/staff";
import { useSession } from "@/src/shared/auth";

export function useStaffActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: staffQueryKeys.all });
  const createStaff = useMutation({
    mutationFn: (body: CreateStaff) =>
      authorizedRequest<StaffMutation>("/staff", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateStaff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStaff }) =>
      authorizedRequest<StaffMutation>(`/staff/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  return { createStaff, updateStaff };
}
