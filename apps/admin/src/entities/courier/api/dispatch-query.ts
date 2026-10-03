import { useQueries, useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type { CourierRoute, DispatchSnapshot } from "../model/types";
import { createRouteRequestQueue } from "./route-request-queue";

const requestRoute = createRouteRequestQueue();

export const courierQueryKeys = {
  all: ["couriers"] as const,
  dispatch: (userId: string) =>
    [...courierQueryKeys.all, "dispatch", userId] as const,
  route: (userId: string, courierId: string) =>
    [...courierQueryKeys.all, "route", userId, courierId] as const,
};

export function useDispatchSnapshot() {
  const { session, authorizedRequest } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(session);
  return useQuery({
    queryKey: courierQueryKeys.dispatch(userId),
    queryFn: ({ signal }) =>
      authorizedRequest<DispatchSnapshot>("/tracking/dispatch", {
        signal,
      }),
    enabled: canViewDispatch,
    staleTime: 20_000,
    gcTime: 2 * 60_000,
    refetchInterval: () =>
      typeof document !== "undefined" && document.visibilityState === "visible"
        ? 30_000
        : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

function useRouteQueries(courierIds: Array<string | null>) {
  const { session, authorizedRequest } = useSession();
  const userId = session?.user.id ?? "anonymous";
  const canViewDispatch = Boolean(session);
  return useQueries({
    queries: courierIds.map((courierId) => ({
      queryKey: courierQueryKeys.route(userId, courierId ?? "unselected"),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        requestRoute(
          () =>
            authorizedRequest<CourierRoute>(
              `/orders/couriers/${courierId}/route`,
              { signal },
            ),
          signal,
        ),
      enabled: canViewDispatch && Boolean(courierId),
      staleTime: 10_000,
      gcTime: 2 * 60_000,
      retry: 1,
    })),
  });
}

export function useCourierRoute(courierId: string | null) {
  return useRouteQueries([courierId])[0];
}

export function useCourierRoutes(courierIds: string[]) {
  const queries = useRouteQueries(courierIds);
  return {
    data: queries.map((query, index) => ({
      courierId: courierIds[index],
      route: query.data ?? null,
    })),
    isFetching: queries.some((query) => query.isFetching),
    isPending: queries.some((query) => query.isPending),
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
  };
}
