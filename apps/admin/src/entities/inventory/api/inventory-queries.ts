import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  Ingredient,
  Recipe,
  StockAlert,
  StockItem,
  InventoryMovement,
} from "../model/types";

export const inventoryQueryKeys = {
  all: ["inventory"] as const,
  ingredients: (userId: string) =>
    [...inventoryQueryKeys.all, "ingredients", userId] as const,
  recipes: (userId: string) =>
    [...inventoryQueryKeys.all, "recipes", userId] as const,
  stock: (userId: string, branchId: string) =>
    [...inventoryQueryKeys.all, "stock", userId, branchId] as const,
  alerts: (userId: string, branchId: string) =>
    [...inventoryQueryKeys.all, "alerts", userId, branchId] as const,
  movements: (userId: string) =>
    [...inventoryQueryKeys.all, "movements", userId] as const,
};

export function useInventoryIngredients() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: inventoryQueryKeys.ingredients(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Ingredient[]>("/inventory/ingredients", { signal }),
    enabled: Boolean(session),
    staleTime: 20_000,
  });
}

export function useInventoryRecipes() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: inventoryQueryKeys.recipes(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Recipe[]>("/inventory/recipes", { signal }),
    enabled: Boolean(session),
    staleTime: 20_000,
  });
}

export function useInventoryStock(branchId: string | undefined) {
  const { session, authorizedRequest } = useSession();
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return useQuery({
    queryKey: inventoryQueryKeys.stock(
      session?.user.id ?? "anonymous",
      branchId ?? "all",
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<StockItem[]>(`/inventory/stock${query}`, { signal }),
    enabled: Boolean(session),
    staleTime: 15_000,
    gcTime: 300_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

// Mounted exactly once by the admin shell; the notification panel uses this
// observer's data and never creates a second polling loop.
export function useInventoryMovements() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: inventoryQueryKeys.movements(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<InventoryMovement[]>("/inventory/movements?limit=20", {
        signal,
      }),
    enabled: Boolean(session),
    staleTime: 15_000,
    gcTime: 300_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

export function useInventoryAlerts(branchId: string | undefined) {
  const { session, authorizedRequest } = useSession();
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return useQuery({
    queryKey: inventoryQueryKeys.alerts(
      session?.user.id ?? "anonymous",
      branchId ?? "all",
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<StockAlert[]>(`/inventory/alerts${query}`, { signal }),
    enabled: Boolean(session),
    staleTime: 15_000,
  });
}
