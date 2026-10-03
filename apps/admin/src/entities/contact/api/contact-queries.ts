import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { ContactSettings } from "../model/types";

export const contactQueryKeys = {
  all: ["contact-settings"] as const,
  detail: (userId: string) => [...contactQueryKeys.all, userId] as const,
};

export function useContactSettings() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: contactQueryKeys.detail(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<ContactSettings>("/contacts", { signal }),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}
