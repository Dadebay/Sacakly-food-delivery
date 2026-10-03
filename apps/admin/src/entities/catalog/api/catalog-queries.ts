import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSession } from "@/src/shared/auth";
import type {
  Category,
  CategoryListItem,
  Cafe,
  Product,
  ProductPage,
  ReceiptPrinter,
  ReceiptPrintSettings,
} from "../model/types";

export const catalogQueryKeys = {
  all: ["catalog"] as const,
  cafes: (userId: string) =>
    [...catalogQueryKeys.all, "cafes", userId] as const,
  categories: (userId: string) =>
    [...catalogQueryKeys.all, "categories", userId] as const,
  categorySummaries: (userId: string) =>
    [...catalogQueryKeys.all, "category-summaries", userId] as const,
  products: (userId: string) =>
    [...catalogQueryKeys.all, "products", userId] as const,
  productPage: (userId: string, params: AdminProductPageParams) =>
    [...catalogQueryKeys.all, "product-page", userId, params] as const,
  receiptPrintSettings: (userId: string) =>
    [...catalogQueryKeys.all, "receipt-print-settings", userId] as const,
  receiptPrinters: (userId: string) =>
    [...catalogQueryKeys.all, "receipt-printers", userId] as const,
};

export type AdminProductPageParams = {
  page: number;
  limit: number;
  categoryId?: string;
  cafeId?: string;
  query?: string;
};

function adminProductPagePath(params: AdminProductPageParams) {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.categoryId) search.set("categoryId", params.categoryId);
  if (params.cafeId) search.set("cafeId", params.cafeId);
  if (params.query) search.set("query", params.query);
  return `/catalog/admin/products/page?${search.toString()}`;
}

export function useAdminCafes() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.cafes(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Cafe[]>("/catalog/admin/cafes", { signal }),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

export function useAdminCategories() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.categories(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Category[]>("/catalog/admin/categories", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useAdminCategorySummaries() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.categorySummaries(
      session?.user.id ?? "anonymous",
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<CategoryListItem[]>(
        "/catalog/admin/category-summaries",
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

export function useReceiptPrintSettings() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.receiptPrintSettings(
      session?.user.id ?? "anonymous",
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<ReceiptPrintSettings>(
        "/catalog/admin/receipt-print-settings",
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useReceiptPrinters() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.receiptPrinters(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<ReceiptPrinter[]>("/catalog/admin/receipt-printers", {
        signal,
      }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
}

export function useAdminProducts() {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.products(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) =>
      authorizedRequest<Product[]>("/catalog/admin/products", { signal }),
    enabled: Boolean(session),
    staleTime: 20_000,
  });
}

export function useAdminProductPage(
  params: AdminProductPageParams,
  enabled = true,
) {
  const { session, authorizedRequest } = useSession();
  return useQuery({
    queryKey: catalogQueryKeys.productPage(
      session?.user.id ?? "anonymous",
      params,
    ),
    queryFn: ({ signal }) =>
      authorizedRequest<ProductPage>(adminProductPagePath(params), { signal }),
    enabled: Boolean(session) && enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
