import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  accountingQueryKeys,
  type CashHandoff,
  type ConfirmCashHandoff,
  type SubmitCashHandoff,
  type UpdateAccountingSettings,
  type AccountingSettings,
} from "@/src/entities/accounting";
import { useSession } from "@/src/shared/auth";

export function useAccountingActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: accountingQueryKeys.all });

  const updateSettings = useMutation({
    mutationFn: (body: UpdateAccountingSettings) =>
      authorizedRequest<AccountingSettings>("/accounting/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const submitHandoff = useMutation({
    mutationFn: (body: SubmitCashHandoff) =>
      authorizedRequest<CashHandoff>("/accounting/handoffs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const confirmHandoff = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConfirmCashHandoff }) =>
      authorizedRequest<CashHandoff>(`/accounting/handoffs/${id}/confirm`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  return { updateSettings, submitHandoff, confirmHandoff };
}
