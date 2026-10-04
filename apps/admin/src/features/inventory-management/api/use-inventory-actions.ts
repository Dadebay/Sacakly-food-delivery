import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { components } from "@sacakly/api-contract";
import { useSession } from "@/src/shared/auth";
import type {
  AdjustStock,
  CreateIngredient,
  Ingredient,
  Recipe,
  StockItem,
  UpsertRecipe,
} from "@/src/entities/inventory";

export function useInventoryActions() {
  const { session, authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = async (domains: string[]) =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "inventory" &&
        domains.includes(String(query.queryKey[1])) &&
        query.queryKey[2] === session?.user.id,
    });

  const createIngredient = useMutation({
    mutationFn: (payload: CreateIngredient) =>
      authorizedRequest<Ingredient>("/inventory/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => refresh(["ingredients", "stock", "alerts"]),
  });
  const saveRecipe = useMutation({
    mutationFn: ({
      productId,
      payload,
    }: {
      productId: string;
      payload: UpsertRecipe;
    }) =>
      authorizedRequest<Recipe>(`/inventory/recipes/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => refresh(["recipes"]),
  });
  const updateIngredient = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: components["schemas"]["UpdateIngredientDto"];
    }) =>
      authorizedRequest<Ingredient>("/inventory/ingredients/" + id, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => refresh(["ingredients", "stock", "alerts", "recipes"]),
  });
  const adjustStock = useMutation({
    mutationFn: ({
      ingredientId,
      payload,
    }: {
      ingredientId: string;
      payload: AdjustStock;
    }) =>
      authorizedRequest<StockItem>(`/inventory/stock/${ingredientId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => refresh(["stock", "alerts", "movements"]),
  });
  return { createIngredient, updateIngredient, saveRecipe, adjustStock };
}
