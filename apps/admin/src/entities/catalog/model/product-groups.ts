import type { Product } from "./types";

type FilterableCategory = {
  name: string;
  slug: string;
  receiptPrinterIp?: string | null;
  cafe?: { name: string };
};

type GroupableCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  cafe?: { name: string; isActive: boolean };
};

type GroupableProduct = {
  categoryId: string;
  category?: GroupableCategory;
  pricingType?: "FIXED" | "VARIANT";
  variants?: readonly { isActive?: boolean }[];
};

type ProductFilter = {
  categoryId?: string;
  query?: string;
};

function normalizedSearch(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("ru-RU") ?? "";
}

export function filterCatalogCategories<TCategory extends FilterableCategory>(
  categories: readonly TCategory[],
  query = "",
) {
  const search = normalizedSearch(query);
  if (!search) return [...categories];

  return categories.filter((category) =>
    `${category.cafe?.name ?? ""} ${category.name} ${category.slug} ${category.receiptPrinterIp ?? ""}`
      .toLocaleLowerCase("ru-RU")
      .includes(search),
  );
}

export function filterCatalogProducts(
  products: readonly Product[],
  { categoryId = "", query = "" }: ProductFilter = {},
) {
  const search = normalizedSearch(query);

  return products.filter((product) => {
    if (categoryId && product.categoryId !== categoryId) return false;
    if (!search) return true;

    return `${product.name} ${product.slug} ${product.description} ${product.receiptPrinterIp ?? ""} ${product.effectiveReceiptPrinterIp ?? ""} ${product.category?.cafe?.name ?? ""} ${product.category?.name ?? ""}`
      .toLocaleLowerCase("ru-RU")
      .includes(search);
  });
}

export function filterOrderableProducts(
  products: readonly Product[],
  { categoryId = "", query = "" }: ProductFilter = {},
) {
  const search = normalizedSearch(query);

  return products.filter((product) => {
    if (
      !product.isActive ||
      product.category?.isActive === false ||
      product.category?.cafe?.isActive === false
    )
      return false;
    if (
      product.pricingType === "VARIANT" &&
      !product.variants?.some(({ isActive }) => isActive)
    ) {
      return false;
    }
    if (categoryId && product.categoryId !== categoryId) return false;
    if (!search) return true;

    return (
      product.name.toLocaleLowerCase("ru-RU").includes(search) ||
      product.category?.name.toLocaleLowerCase("ru-RU").includes(search) ===
        true ||
      product.category?.cafe?.name
        .toLocaleLowerCase("ru-RU")
        .includes(search) === true
    );
  });
}

export type ProductCategoryGroup<TProduct extends GroupableProduct> = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  products: TProduct[];
};

export function groupProductsByCategory<TProduct extends GroupableProduct>(
  products: readonly TProduct[],
) {
  const groups = new Map<string, ProductCategoryGroup<TProduct>>();

  for (const product of products) {
    const category = product.category;
    const categoryId = category?.id ?? product.categoryId;
    const current = groups.get(categoryId);

    if (current) {
      current.products.push(product);
      continue;
    }

    groups.set(categoryId, {
      id: categoryId,
      name: category?.name ?? "Без категории",
      sortOrder: category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      isActive: category?.isActive ?? false,
      products: [product],
    });
  }

  return [...groups.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  );
}
