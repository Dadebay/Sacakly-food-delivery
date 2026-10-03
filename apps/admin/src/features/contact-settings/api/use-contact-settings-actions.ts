import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  contactQueryKeys,
  type ContactSettings,
  type UpdateContactSettings,
} from "@/src/entities/contact";
import { useSession } from "@/src/shared/auth";

export function useContactSettingsActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();

  const updateContactSettings = useMutation({
    mutationFn: (body: UpdateContactSettings) =>
      authorizedRequest<ContactSettings>("/contacts", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contactQueryKeys.all });
    },
  });

  return { updateContactSettings };
}
