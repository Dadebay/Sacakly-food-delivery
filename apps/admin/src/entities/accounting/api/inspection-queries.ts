import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import { accountingQueryKeys } from "./accounting-queries";
import type {
  InspectionAuditPage,
  InspectionCarryoverPage,
  InspectionOrderDetail,
  InspectionOrdersPage,
  InspectionOverview,
} from "../model/types";

type InspectionResponses = {
  overview: InspectionOverview;
  orders: InspectionOrdersPage;
  audit: InspectionAuditPage;
  carryover: InspectionCarryoverPage;
};

export function useAccountingInspection<T extends keyof InspectionResponses>(
  resource: T,
  search: string,
  enabled: boolean,
) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: [
      ...accountingQueryKeys.all,
      "inspection",
      session?.user.id,
      resource,
      search,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<InspectionResponses[T]>(
        `/accounting/${resource}?${search}`,
        { signal },
      ),
    enabled:
      enabled &&
      Boolean(
        session && ["ACCOUNTANT", "SUPER_ADMIN"].includes(session.user.role),
      ),
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

export function useAccountingOrder(id: string | null) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: [
      ...accountingQueryKeys.all,
      "inspection-order",
      session?.user.id,
      id,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<InspectionOrderDetail>(`/accounting/orders/${id}`, {
        signal,
      }),
    enabled: Boolean(
      id &&
      session &&
      ["ACCOUNTANT", "SUPER_ADMIN"].includes(session.user.role),
    ),
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}

export function useAccountingOrderAudit(id: string | null, page: number) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: [
      ...accountingQueryKeys.all,
      "inspection-order-audit",
      session?.user.id,
      id,
      page,
    ],
    queryFn: ({ signal }) =>
      authorizedRequest<InspectionAuditPage>(
        `/accounting/orders/${id}/audit?page=${page}&limit=25`,
        { signal },
      ),
    enabled: Boolean(
      id &&
      session &&
      ["ACCOUNTANT", "SUPER_ADMIN"].includes(session.user.role),
    ),
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
}
