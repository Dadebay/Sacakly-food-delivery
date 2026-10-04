import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  LoginAttemptPlatform,
  LoginAttemptStatus,
  LoginAttemptsResponse,
} from "../model/types";
import type { components } from "@sacakly/api-contract";

export type LoginAttemptFilters = {
  phone?: string;
  status?: LoginAttemptStatus;
  platform?: LoginAttemptPlatform;
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export const loginAttemptQueryKeys = {
  all: ["login-attempts"] as const,
  list: (userId: string, filters: LoginAttemptFilters) =>
    [...loginAttemptQueryKeys.all, userId, filters] as const,
};

export function useLoginAttempts(filters: LoginAttemptFilters) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: loginAttemptQueryKeys.list(
      session?.user.id ?? "anonymous",
      filters,
    ),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return authorizedRequest<LoginAttemptsResponse>(
        `/staff/login-attempts?${params}`,
        { signal },
      );
    },
    enabled: Boolean(session),
    staleTime: 15_000,
  });
}

export function useCustomerCounts() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: [
      ...loginAttemptQueryKeys.all,
      "customer-counts",
      session?.user.id,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<components["schemas"]["CustomerCountsResponseDto"]>(
        "/staff/customer-counts",
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}
