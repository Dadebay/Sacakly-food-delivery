import type { UpdateCategory } from "@/src/entities/catalog";

type CategoryRouteSource = {
  isActive: boolean;
  receiptPrinterId: string | null;
  sortOrder: number;
};

export function buildCategoryPrinterUpdate(
  category: CategoryRouteSource,
  receiptPrinterId: string,
): UpdateCategory {
  return {
    receiptPrinterId: receiptPrinterId || null,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export function buildCategoryVisibilityUpdate(
  category: CategoryRouteSource,
): UpdateCategory {
  return {
    receiptPrinterId: category.receiptPrinterId,
    sortOrder: category.sortOrder,
    isActive: !category.isActive,
  };
}
