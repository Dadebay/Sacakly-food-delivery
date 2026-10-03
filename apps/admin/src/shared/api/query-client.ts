import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const status =
            error &&
            typeof error === "object" &&
            "status" in error &&
            typeof error.status === "number"
              ? error.status
              : 0;
          return status >= 400 && status < 500 ? false : failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
