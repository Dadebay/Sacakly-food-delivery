import { lazy, Suspense, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import {
  canAddProductImages,
  filterCatalogCategories,
  groupProductsByCategory,
  MAX_PRODUCT_IMAGES,
  useAdminCafes,
  useAdminCategorySummaries,
  useAdminProductPage,
  useReceiptPrinters,
  useReceiptPrintSettings,
  type CategoryListItem,
  type Product,
} from "@/src/entities/catalog";
import { useMyAdminPageAccess } from "@/src/entities/admin-page-access";
import { useCatalogActions } from "@/src/features/catalog-management";
import { resolveApiUrl } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { AsyncPanel, ConfirmDeleteDialog, DataTable } from "@/src/shared/ui";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  FloppyDiskIcon,
  PencilEdit02Icon,
  PrinterOffIcon,
  Refresh01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import {
  categoryFormSchema,
  productFormSchema,
  receiptPrintSettingsFormSchema,
  type CategoryFormValues,
  type ProductFormValues,
  type ReceiptPrintSettingsFormValues,
} from "../model/catalog-forms";
import {
  buildCategoryPrinterUpdate,
  buildCategoryVisibilityUpdate,
} from "../model/category-receipt-route";
import { CATALOG_PRODUCT_PAGE_SIZE } from "../model/catalog-pagination";
import { useDebouncedCatalogSearch } from "../model/use-debounced-catalog-search";
import { CatalogPagination } from "./catalog-pagination";
import { CafeCatalogSection } from "./cafe-catalog-section";
import { CategoryReceiptRoutes } from "./category-receipt-routes";
import { ProductReceiptRoute } from "./product-receipt-route";
import { ReceiptPrinterRegistry } from "./receipt-printer-registry";
import { OrderingHoursSettings } from "./ordering-hours-settings";

const GiftManager = lazy(() => import("./gift-manager").then((module) => ({ default: module.GiftManager })));

type CatalogDeleteTarget =
  | {
      kind: "category";
      id: string;
      name: string;
      productCount: number;
    }
  | { kind: "product"; id: string; name: string };

type CatalogTab = "cafes" | "categories" | "products" | "printers" | "hours" | "gifts";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function imageFilesFromDrop(event: { dataTransfer: DataTransfer }) {
  return Array.from(event.dataTransfer.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}

export function CatalogManager() {
  const { session } = useSession();
  const pageAccess = useMyAdminPageAccess();
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("cafes");
  const [catalogCafeFilter, setCatalogCafeFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [productPage, setProductPage] = useState(1);
  const debouncedCatalogSearch = useDebouncedCatalogSearch(catalogSearch);
  const cafes = useAdminCafes();
  const categories = useAdminCategorySummaries();
  const products = useAdminProductPage(
    {
      page: productPage,
      limit: CATALOG_PRODUCT_PAGE_SIZE,
      ...(catalogCafeFilter ? { cafeId: catalogCafeFilter } : {}),
      ...(productCategoryFilter ? { categoryId: productCategoryFilter } : {}),
      ...(debouncedCatalogSearch.trim()
        ? { query: debouncedCatalogSearch.trim() }
        : {}),
    },
    catalogTab === "products",
  );
  const receiptPrinters = useReceiptPrinters();
  const receiptPrintSettings = useReceiptPrintSettings();
  const actions = useCatalogActions();
  const [categoryEdit, setCategoryEdit] = useState<CategoryListItem | null>(
    null,
  );
  const [productEdit, setProductEdit] = useState<Product | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [expandedProductGroups, setExpandedProductGroups] = useState<
    Set<string> | "all" | null
  >(null);
  const [storedProductImages, setStoredProductImages] = useState<
    Product["images"]
  >([]);
  const [selectedProductFiles, setSelectedProductFiles] = useState<File[]>([]);
  const [productImageError, setProductImageError] = useState("");
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [catalogDelete, setCatalogDelete] =
    useState<CatalogDeleteTarget | null>(null);
  const {
    register: registerCategory,
    handleSubmit: handleCategorySubmit,
    reset: resetCategory,
    formState: { errors: categoryErrors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    mode: "onBlur",
    defaultValues: {
      cafeId: "",
      name: "",
      receiptPrinterId: "",
      sortOrder: 0,
      isActive: true,
      image: undefined,
    },
  });
  const {
    register: registerReceiptPrintSettings,
    handleSubmit: handleReceiptPrintSettingsSubmit,
    formState: { errors: receiptPrintSettingsErrors },
  } = useForm<ReceiptPrintSettingsFormValues>({
    resolver: zodResolver(receiptPrintSettingsFormSchema),
    mode: "onBlur",
    values: {
      mainPrinterId: receiptPrintSettings.data?.mainPrinterId ?? "",
      mainCopies: receiptPrintSettings.data?.mainCopies ?? 2,
    },
  });
  const {
    register: registerProduct,
    handleSubmit: handleProductSubmit,
    reset: resetProduct,
    getValues: getProductValues,
    setValue: setProductValue,
    control: productControl,
    formState: { errors: productErrors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    mode: "onBlur",
    defaultValues: {
      categoryId: "",
      name: "",
      description: "",
      pricingType: "FIXED",
      price: 0,
      receiptPrinterId: "",
      preparationMinutes: 0,
      loyaltyPoints: 1,
      variantLabel: "",
      variants: [],
      sortOrder: 0,
      isActive: true,
    },
  });
  const {
    fields: productVariantFields,
    append: appendProductVariant,
    remove: removeProductVariant,
    replace: replaceProductVariants,
  } = useFieldArray({
    control: productControl,
    name: "variants",
    keyName: "formKey",
  });
  const watchedProductVariants =
    useWatch({ control: productControl, name: "variants" }) ?? [];
  const watchedPricingType = useWatch({
    control: productControl,
    name: "pricingType",
  });
  const canEdit = Boolean(
    session &&
    (["ADMIN", "SUPER_ADMIN"].includes(session.user.role) ||
      pageAccess.data?.allowedPages.includes("CATALOG")),
  );
  const hasSearch = Boolean(catalogSearch.trim());
  const filteredCategories = useMemo(
    () =>
      filterCatalogCategories(categories.data ?? [], catalogSearch).filter(
        (category) =>
          !catalogCafeFilter || category.cafeId === catalogCafeFilter,
      ),
    [catalogCafeFilter, catalogSearch, categories.data],
  );
  const productItems = products.data?.items;
  const productGroups = useMemo(
    () => groupProductsByCategory(productItems ?? []),
    [productItems],
  );
  const totalProductCount = useMemo(
    () =>
      (categories.data ?? []).reduce(
        (total, category) => total + category.productCount,
        0,
      ),
    [categories.data],
  );

  const expandedProductGroupCount =
    expandedProductGroups === "all"
      ? productGroups.length
      : expandedProductGroups === null
        ? Math.min(1, productGroups.length)
        : productGroups.filter(({ id }) => expandedProductGroups.has(id))
            .length;

  function toggleProductGroup(groupId: string) {
    setExpandedProductGroups((current) => {
      const next =
        current === "all"
          ? new Set(productGroups.map(({ id }) => id))
          : current === null
            ? new Set(productGroups[0] ? [productGroups[0].id] : [])
            : new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const categoryColumns = useMemo<ColumnDef<CategoryListItem, unknown>[]>(
    () => [
      {
        header: "Категория",
        cell: ({ row }) => (
          <div className="media-cell">
            {row.original.imageUrl ? (
              <img
                src={resolveApiUrl(row.original.imageUrl)}
                alt=""
                loading="lazy"
                width={48}
                height={48}
              />
            ) : (
              <span className="media-placeholder">◫</span>
            )}
            <div className="primary-cell">
              <strong>{row.original.name}</strong>
              <small>
                {row.original.cafe.name} · {row.original.productCount} блюд ·
                порядок {row.original.sortOrder}
              </small>
              <small
                title={
                  row.original.receiptPrinter
                    ? `${row.original.receiptPrinter.name} · ${row.original.receiptPrinter.ipAddress}:${row.original.receiptPrinter.port}`
                    : undefined
                }
              >
                Кухня:{" "}
                {row.original.receiptPrinter
                  ? row.original.receiptPrinter.name
                  : (row.original.receiptPrinterIp ?? "аппарат не назначен")}
              </small>
            </div>
          </div>
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "Активна" : "Скрыта"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                aria-label="Изменить"
                title="Изменить"
                className="secondary-button compact row-icon-button"
                data-testid={`category-edit-${row.original.id}`}
                onClick={() => {
                  setCategoryEdit(row.original);
                  resetCategory({
                    cafeId: row.original.cafeId,
                    name: row.original.name,
                    receiptPrinterId: row.original.receiptPrinterId ?? "",
                    sortOrder: row.original.sortOrder,
                    isActive: row.original.isActive,
                    image: undefined,
                  });
                  setShowCategoryForm(true);
                }}
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
              <button
                aria-label={row.original.isActive ? "Скрыть" : "Включить"}
                title={row.original.isActive ? "Скрыть" : "Включить"}
                className="text-button row-icon-button"
                data-testid={`category-visibility-table-${row.original.id}`}
                disabled={actions.updateCategory.isPending}
                onClick={() =>
                  actions.updateCategory.mutate({
                    id: row.original.id,
                    body: {
                      sortOrder: row.original.sortOrder,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                <HugeiconsIcon
                  icon={row.original.isActive ? ViewOffIcon : ViewIcon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
              <button
                aria-label="Удалить"
                title="Удалить"
                className="text-button danger row-icon-button"
                data-testid={`category-delete-table-open-${row.original.id}`}
                disabled={actions.deleteCategory.isPending}
                type="button"
                onClick={() => {
                  actions.deleteCategory.reset();
                  setCatalogDelete({
                    kind: "category",
                    id: row.original.id,
                    name: row.original.name,
                    productCount: row.original.productCount,
                  });
                }}
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
            </div>
          ),
      },
    ],
    [actions.deleteCategory, actions.updateCategory, canEdit, resetCategory],
  );

  const productColumns = useMemo<ColumnDef<Product, unknown>[]>(
    () => [
      {
        header: "Товар",
        cell: ({ row }) => {
          const imageCount =
            row.original.images.length +
            row.original.variants.reduce(
              (sum, variant) => sum + variant.images.length,
              0,
            );
          return (
            <div className="media-cell">
              {row.original.displayImageUrl ? (
                <div
                  className="product-image-stack"
                  aria-label={`Изображений: ${imageCount}`}
                >
                  <img
                    src={resolveApiUrl(row.original.displayImageUrl)}
                    alt=""
                    loading="lazy"
                    width={48}
                    height={48}
                  />
                  {imageCount > 1 && <span>+{imageCount - 1}</span>}
                </div>
              ) : (
                <span className="media-placeholder">◫</span>
              )}
              <div className="primary-cell">
                <strong>{row.original.name}</strong>
                <small>{row.original.description}</small>
              </div>
            </div>
          );
        },
      },
      {
        header: "Цена",
        cell: ({ row }) => (
          <div className="primary-cell">
            <strong>
              {row.original.hasVariants ? "от " : ""}
              {Number(row.original.minPrice).toFixed(2)} TMT
            </strong>
            {row.original.hasVariants && (
              <small>
                {row.original.variantLabel}: {row.original.variants.length}
              </small>
            )}
          </div>
        ),
      },
      {
        header: "Чековый аппарат",
        cell: ({ row }) => (
          <ProductReceiptRoute
            product={row.original}
            printers={receiptPrinters.data ?? []}
            canEdit={canEdit}
            isPending={actions.updateProduct.isPending}
            onSave={async (product, receiptPrinterId) => {
              await actions.updateProduct.mutateAsync({
                id: product.id,
                body: {
                  receiptPrinterId: receiptPrinterId || null,
                  sortOrder: product.sortOrder,
                  isActive: product.isActive,
                },
              });
            }}
          />
        ),
      },
      {
        header: "Статус",
        cell: ({ row }) => (
          <span className={row.original.isActive ? "enabled" : "disabled"}>
            {row.original.isActive ? "В продаже" : "Скрыт"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit && (
            <div className="row-actions">
              <button
                aria-label="Изменить"
                title="Изменить"
                className="secondary-button compact row-icon-button"
                data-testid={`product-edit-${row.original.id}`}
                onClick={() => {
                  setProductEdit(row.original);
                  setStoredProductImages(row.original.images);
                  setSelectedProductFiles([]);
                  setProductImageError("");
                  resetProduct({
                    categoryId: row.original.categoryId,
                    name: row.original.name,
                    description: row.original.description,
                    pricingType: row.original.pricingType,
                    price: Number(row.original.price),
                    receiptPrinterId: row.original.receiptPrinterId ?? "",
                    preparationMinutes: row.original.preparationMinutes,
                    loyaltyPoints: row.original.loyaltyPoints,
                    variantLabel: row.original.variantLabel ?? "",
                    variants:
                      row.original.pricingType === "VARIANT"
                        ? row.original.variants.map((variant) => ({
                            id: variant.id,
                            name: variant.name,
                            description: variant.description ?? "",
                            price: Number(variant.price),
                            sortOrder: variant.sortOrder,
                            isActive: variant.isActive,
                            imageUrls: variant.images.map(({ url }) => url),
                            imageFiles: undefined,
                          }))
                        : [],
                    sortOrder: row.original.sortOrder,
                    isActive: row.original.isActive,
                  });
                  setShowProductForm(true);
                }}
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
              <button
                aria-label={row.original.isActive ? "Скрыть" : "Включить"}
                title={row.original.isActive ? "Скрыть" : "Включить"}
                className="text-button row-icon-button"
                data-testid={`product-visibility-${row.original.id}`}
                disabled={actions.updateProduct.isPending}
                onClick={() =>
                  actions.updateProduct.mutate({
                    id: row.original.id,
                    body: {
                      sortOrder: row.original.sortOrder,
                      isActive: !row.original.isActive,
                    },
                  })
                }
              >
                <HugeiconsIcon
                  icon={row.original.isActive ? ViewOffIcon : ViewIcon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
              <button
                aria-label="Удалить"
                title="Удалить"
                className="text-button danger row-icon-button"
                data-testid={`product-delete-open-${row.original.id}`}
                disabled={actions.deleteProduct.isPending}
                type="button"
                onClick={() => {
                  actions.deleteProduct.reset();
                  setCatalogDelete({
                    kind: "product",
                    id: row.original.id,
                    name: row.original.name,
                  });
                }}
              >
                <HugeiconsIcon
                  icon={Delete02Icon}
                  size={15}
                  strokeWidth={1.8}
                />
              </button>
            </div>
          ),
      },
    ],
    [
      actions.deleteProduct,
      actions.updateProduct,
      canEdit,
      receiptPrinters.data,
      resetProduct,
    ],
  );

  async function submitCategory(values: CategoryFormValues) {
    const file = (values.image as FileList | undefined)?.item(0);
    let imageUrl = categoryEdit?.imageUrl ?? undefined;
    if (file?.size) {
      imageUrl = (await actions.uploadImage.mutateAsync(file)).url;
    }
    const body = {
      cafeId: values.cafeId,
      name: values.name,
      receiptPrinterId: values.receiptPrinterId || null,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      ...(imageUrl ? { imageUrl } : {}),
    };
    if (categoryEdit) {
      await actions.updateCategory.mutateAsync({
        id: categoryEdit.id,
        body,
      });
    } else {
      await actions.createCategory.mutateAsync(body);
    }
    setCategoryEdit(null);
    setShowCategoryForm(false);
    resetCategory();
  }

  async function submitReceiptPrintSettings(
    values: ReceiptPrintSettingsFormValues,
  ) {
    await actions.updateReceiptPrintSettings.mutateAsync({
      mainPrinterId: values.mainPrinterId || null,
      mainCopies: values.mainCopies,
    });
  }

  async function submitProduct(values: ProductFormValues) {
    setProductImageError("");
    if (
      !canAddProductImages(
        storedProductImages.length,
        selectedProductFiles.length,
      )
    ) {
      setProductImageError(
        `У блюда может быть не больше ${MAX_PRODUCT_IMAGES} изображений.`,
      );
      return;
    }
    for (const variant of values.variants) {
      const files = Array.from(
        (variant.imageFiles as FileList | undefined) ?? [],
      );
      if (!canAddProductImages(variant.imageUrls.length, files.length)) {
        setProductImageError(
          `У варианта «${variant.name}» может быть не больше ${MAX_PRODUCT_IMAGES} изображений.`,
        );
        return;
      }
    }
    const uploadedImages = selectedProductFiles.length
      ? await actions.uploadImages.mutateAsync(selectedProductFiles)
      : [];
    const imageUrls = [
      ...storedProductImages.map(({ url }) => url),
      ...uploadedImages.map(({ url }) => url),
    ];
    const variants = await Promise.all(
      values.variants.map(async ({ imageFiles, ...variant }) => {
        const files = Array.from((imageFiles as FileList | undefined) ?? []);
        const uploaded = files.length
          ? await actions.uploadImages.mutateAsync(files)
          : [];
        return {
          ...variant,
          description: variant.description || undefined,
          imageUrls: [...variant.imageUrls, ...uploaded.map(({ url }) => url)],
        };
      }),
    );
    const body = {
      categoryId: values.categoryId,
      name: values.name,
      description: values.description,
      pricingType: values.pricingType,
      ...(values.pricingType === "FIXED" ? { price: values.price } : {}),
      receiptPrinterId: values.receiptPrinterId || null,
      preparationMinutes: values.preparationMinutes,
      loyaltyPoints: values.loyaltyPoints,
      variantLabel:
        values.pricingType === "VARIANT"
          ? values.variantLabel || undefined
          : undefined,
      variants: values.pricingType === "VARIANT" ? variants : [],
      sortOrder: values.sortOrder,
      isActive: values.isActive,
      imageUrls,
    };
    if (productEdit) {
      await actions.updateProduct.mutateAsync({
        id: productEdit.id,
        body,
      });
    } else {
      await actions.createProduct.mutateAsync(body);
    }
    setProductEdit(null);
    setStoredProductImages([]);
    setSelectedProductFiles([]);
    setShowProductForm(false);
    resetProduct();
  }

  async function deleteSelectedCatalogItem() {
    if (!catalogDelete) return;
    if (catalogDelete.kind === "category") {
      await actions.deleteCategory.mutateAsync(catalogDelete.id);
    } else {
      await actions.deleteProduct.mutateAsync(catalogDelete.id);
      if (products.data?.items.length === 1 && productPage > 1) {
        setProductPage((current) => current - 1);
      }
    }
    setCatalogDelete(null);
  }

  const mutationMessage =
    productImageError ||
    errorMessage(
      actions.uploadImage.error ||
        actions.uploadImages.error ||
        actions.createCategory.error ||
        actions.updateCategory.error ||
        actions.deleteCategory.error ||
        actions.updateReceiptPrintSettings.error ||
        actions.createReceiptPrinter.error ||
        actions.updateReceiptPrinter.error ||
        actions.deleteReceiptPrinter.error ||
        actions.createProduct.error ||
        actions.updateProduct.error ||
        actions.deleteProduct.error ||
        receiptPrintSettings.error,
    );

  const catalogTabs: { id: CatalogTab; label: string; count: number }[] = [
    {
      id: "cafes",
      label: "Кафе",
      count: cafes.data?.length ?? 0,
    },
    {
      id: "categories",
      label: "Категории",
      count: categories.data?.length ?? 0,
    },
    { id: "products", label: "Блюда", count: totalProductCount },
    ...(["ADMIN", "SUPER_ADMIN"].includes(session?.user.role ?? "")
      ? [{ id: "gifts" as const, label: "Подарки", count: 0 }]
      : []),
    {
      id: "printers",
      label: "Чековые аппараты",
      count: receiptPrinters.data?.length ?? 0,
    },
    { id: "hours", label: "Время работы", count: 0 },
  ];

  return (
    <section className="admin-section" data-testid="catalog-manager">
      <header className="section-head" data-testid="catalog-header">
        <div>
          <h1>Каталог кафе</h1>
          <p>Кафе, вложенные категории, блюда, цены и изображения.</p>
        </div>
        {canEdit && (
          <div
            className="header-actions section-header-actions"
            data-testid="catalog-header-actions"
          >
            <button
              className="secondary-button"
              data-testid="catalog-category-open"
              onClick={() => {
                setCatalogTab("categories");
                setCategoryEdit(null);
                resetCategory({
                  cafeId: catalogCafeFilter || cafes.data?.[0]?.id || "",
                  name: "",
                  receiptPrinterId: "",
                  sortOrder: 0,
                  isActive: true,
                  image: undefined,
                });
                setShowCategoryForm((value) => !value);
              }}
            >
              + Категория
            </button>
            <button
              className="primary-button"
              data-testid="catalog-product-open"
              onClick={() => {
                setCatalogTab("products");
                setProductEdit(null);
                setStoredProductImages([]);
                setSelectedProductFiles([]);
                setProductImageError("");
                resetProduct({
                  categoryId:
                    (categories.data ?? []).find(
                      ({ cafeId }) =>
                        !catalogCafeFilter || cafeId === catalogCafeFilter,
                    )?.id ?? "",
                  name: "",
                  description: "",
                  pricingType: "FIXED",
                  price: 0,
                  receiptPrinterId: "",
                  preparationMinutes: 0,
                  loyaltyPoints: 1,
                  variantLabel: "",
                  variants: [],
                  sortOrder: 0,
                  isActive: true,
                });
                setShowProductForm((value) => !value);
              }}
            >
              + Блюдо
            </button>
          </div>
        )}
      </header>

      {mutationMessage && <div className="inline-alert">{mutationMessage}</div>}

      {/* Uc blok tek sayfada alt alta uzuyordu; sekmeler her seferinde
          yalnizca ilgili bolumu gosteriyor. */}
      <div className="catalog-toolbar">
        <div
          className="view-tabs catalog-tabs"
          data-testid="catalog-tabs"
          role="tablist"
          aria-label="Разделы каталога"
        >
          {catalogTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={catalogTab === tab.id}
              className={catalogTab === tab.id ? "active" : ""}
              data-testid={`catalog-tab-${tab.id}`}
              onClick={() => setCatalogTab(tab.id)}
            >
              {tab.label}
              <span className="role-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
        {catalogTab !== "printers" && catalogTab !== "hours" && catalogTab !== "gifts" && (
          <section
            className={
              catalogTab === "cafes"
                ? "catalog-search-panel catalog-search-panel--single"
                : catalogTab === "products"
                  ? "catalog-search-panel catalog-search-panel--triple"
                  : "catalog-search-panel"
            }
            aria-label="Поиск по каталогу"
          >
            <label className="catalog-search-input">
              <span className="visually-hidden">Поиск</span>
              <span aria-hidden="true">⌕</span>
              <input
                data-testid="catalog-search-input"
                value={catalogSearch}
                onChange={(event) => {
                  setCatalogSearch(event.target.value);
                  setProductPage(1);
                  if (event.target.value.trim())
                    setExpandedProductGroups("all");
                }}
                placeholder="Название или описание…"
              />
              {catalogSearch && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  data-testid="catalog-search-clear"
                  onClick={() => {
                    setCatalogSearch("");
                    setProductPage(1);
                  }}
                >
                  ×
                </button>
              )}
            </label>
            {(catalogTab === "categories" || catalogTab === "products") && (
              <label className="catalog-category-filter">
                <span>Кафе</span>
                <select
                  aria-label="Фильтр по кафе"
                  data-testid="catalog-cafe-filter"
                  value={catalogCafeFilter}
                  onChange={(event) => {
                    setCatalogCafeFilter(event.target.value);
                    setProductCategoryFilter("");
                    setProductPage(1);
                    setExpandedProductGroups(null);
                  }}
                >
                  <option value="">Все кафе</option>
                  {(cafes.data ?? []).map((cafe) => (
                    <option key={cafe.id} value={cafe.id}>
                      {cafe.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {catalogTab === "products" && (
              <label className="catalog-category-filter">
                <span>Категория</span>
                <select
                  aria-label="Фильтр по категории"
                  data-testid="catalog-product-category-filter"
                  value={productCategoryFilter}
                  onChange={(event) => {
                    setProductCategoryFilter(event.target.value);
                    setProductPage(1);
                    if (event.target.value) setExpandedProductGroups("all");
                  }}
                >
                  <option value="">Все категории</option>
                  {(categories.data ?? [])
                    .filter(
                      (category) =>
                        !catalogCafeFilter ||
                        category.cafeId === catalogCafeFilter,
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.cafe.name} · {category.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </section>
        )}
      </div>

      {catalogDelete && (
        <ConfirmDeleteDialog
          dialogTestId="catalog-delete-dialog"
          titleId="catalog-delete-title"
          title={
            catalogDelete.kind === "category"
              ? "Удалить категорию?"
              : "Удалить блюдо?"
          }
          description={
            catalogDelete.kind === "category"
              ? `Категория «${catalogDelete.name}» и все её блюда (${catalogDelete.productCount}) исчезнут из каталога.`
              : `Блюдо «${catalogDelete.name}» исчезнет из каталога.`
          }
          note="Если блюдо уже есть в истории заказов, API сохранит данные и откажет в удалении. В таком случае используйте «Скрыть». Изображения останутся в приватном хранилище."
          error={
            errorMessage(
              actions.deleteCategory.error || actions.deleteProduct.error,
            ) ||
            (actions.deleteCategory.error || actions.deleteProduct.error
              ? "Не удалось удалить запись"
              : undefined)
          }
          isPending={
            actions.deleteCategory.isPending || actions.deleteProduct.isPending
          }
          cancelTestId="catalog-delete-cancel"
          confirmTestId="catalog-delete-confirm"
          onCancel={() => {
            actions.deleteCategory.reset();
            actions.deleteProduct.reset();
            setCatalogDelete(null);
          }}
          onConfirm={() => void deleteSelectedCatalogItem()}
        />
      )}

      {catalogTab === "cafes" && (
        <CafeCatalogSection canEdit={canEdit} search={catalogSearch} />
      )}

      {catalogTab === "hours" && <OrderingHoursSettings canEdit={canEdit} />}

      {catalogTab === "gifts" && <Suspense fallback={<p>Загружаем подарки…</p>}><GiftManager canEdit={Boolean(session && ["ADMIN", "SUPER_ADMIN"].includes(session.user.role))} /></Suspense>}

      {catalogTab === "printers" && (
        <>
          <ReceiptPrinterRegistry
            printers={receiptPrinters.data ?? []}
            canEdit={canEdit}
            isLoading={receiptPrinters.isPending}
            isPending={
              actions.createReceiptPrinter.isPending ||
              actions.updateReceiptPrinter.isPending ||
              actions.deleteReceiptPrinter.isPending
            }
            error={errorMessage(
              receiptPrinters.error ||
                actions.createReceiptPrinter.error ||
                actions.updateReceiptPrinter.error ||
                actions.deleteReceiptPrinter.error,
            )}
            onRetry={() => void receiptPrinters.refetch()}
            onCreate={(body) => actions.createReceiptPrinter.mutateAsync(body)}
            onUpdate={(id, body) =>
              actions.updateReceiptPrinter.mutateAsync({ id, body })
            }
            onDelete={(id) => actions.deleteReceiptPrinter.mutateAsync(id)}
          />

          <form
            className="table-card receipt-print-settings-card"
            data-testid="receipt-print-settings-form"
            noValidate
            onSubmit={handleReceiptPrintSettingsSubmit(
              submitReceiptPrintSettings,
            )}
          >
            <div className="receipt-print-settings-copy">
              <h2>Главный чековый аппарат</h2>
              <p>
                Получает полные чеки со всеми блюдами. Кухонные копии ниже
                маршрутизируются отдельно по категориям.
              </p>
            </div>
            <div className="receipt-print-settings-controls">
              <label>
                <span>Главный аппарат</span>
                <select
                  data-testid="main-receipt-printer-select"
                  {...registerReceiptPrintSettings("mainPrinterId")}
                  aria-invalid={Boolean(
                    receiptPrintSettingsErrors.mainPrinterId,
                  )}
                  disabled={!canEdit || receiptPrintSettings.isPending}
                >
                  <option value="">Не печатать главный чек</option>
                  {(receiptPrinters.data ?? []).map((printer) => (
                    <option
                      key={printer.id}
                      value={printer.id}
                      disabled={
                        !printer.isActive &&
                        printer.id !== receiptPrintSettings.data?.mainPrinterId
                      }
                    >
                      {printer.name} · {printer.ipAddress}:{printer.port}
                      {printer.isActive ? "" : " · отключён"}
                    </option>
                  ))}
                </select>
                <FormFieldError
                  message={receiptPrintSettingsErrors.mainPrinterId?.message}
                />
              </label>
              <label>
                <span>Копий на главной кассе</span>
                <input
                  data-testid="main-receipt-copies"
                  type="number"
                  min="1"
                  max="3"
                  {...registerReceiptPrintSettings("mainCopies", {
                    valueAsNumber: true,
                  })}
                  disabled={!canEdit || receiptPrintSettings.isPending}
                />
                <FormFieldError
                  message={receiptPrintSettingsErrors.mainCopies?.message}
                />
              </label>
              <div className="receipt-print-settings-actions">
                {receiptPrintSettings.isError && (
                  <button
                    aria-label="Повторить загрузку"
                    title="Повторить загрузку"
                    className="text-button compact icon-action-button"
                    data-testid="main-receipt-printer-retry"
                    type="button"
                    onClick={() => void receiptPrintSettings.refetch()}
                  >
                    <HugeiconsIcon
                      icon={Refresh01Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </button>
                )}
                {canEdit && (
                  <>
                    <button
                      aria-label="Убрать аппарат"
                      title="Убрать аппарат"
                      className="text-button compact icon-action-button"
                      data-testid="main-receipt-printer-clear"
                      disabled={
                        (!receiptPrintSettings.data?.mainPrinterId &&
                          !receiptPrintSettings.data?.mainPrinterIp) ||
                        actions.updateReceiptPrintSettings.isPending
                      }
                      type="button"
                      onClick={() =>
                        actions.updateReceiptPrintSettings.mutate({
                          mainPrinterId: null,
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={PrinterOffIcon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </button>
                    <button
                      aria-label="Сохранить аппарат"
                      title="Сохранить аппарат"
                      className="primary-button compact icon-action-button"
                      data-testid="main-receipt-printer-save"
                      disabled={actions.updateReceiptPrintSettings.isPending}
                    >
                      <HugeiconsIcon
                        icon={FloppyDiskIcon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </button>
                  </>
                )}
              </div>
            </div>
          </form>

          <CategoryReceiptRoutes
            categories={categories.data ?? []}
            printers={receiptPrinters.data ?? []}
            canEdit={canEdit}
            isLoading={categories.isPending}
            isPending={
              actions.updateCategory.isPending ||
              actions.deleteCategory.isPending
            }
            onRetry={() => void categories.refetch()}
            onSave={async (category, values) => {
              await actions.updateCategory.mutateAsync({
                id: category.id,
                body: buildCategoryPrinterUpdate(
                  category,
                  values.receiptPrinterId,
                ),
              });
            }}
            onClear={async (category) => {
              await actions.updateCategory.mutateAsync({
                id: category.id,
                body: buildCategoryPrinterUpdate(category, ""),
              });
            }}
            onDelete={(category) => {
              actions.deleteCategory.reset();
              setCatalogDelete({
                kind: "category",
                id: category.id,
                name: category.name,
                productCount: category.productCount,
              });
            }}
            onToggleActive={(category) => {
              actions.updateCategory.mutate({
                id: category.id,
                body: buildCategoryVisibilityUpdate(category),
              });
            }}
          />
        </>
      )}

      {showCategoryForm && (
        <div
          className="modal-backdrop catalog-editor-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowCategoryForm(false);
              setCategoryEdit(null);
              resetCategory();
            }
          }}
        >
          <form
            className="editor-card catalog-editor-modal catalog-category-modal"
            data-testid="category-form"
            noValidate
            onSubmit={handleCategorySubmit(submitCategory)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-editor-title"
          >
            <div className="editor-title catalog-editor-title">
              <div>
                <h2 id="category-editor-title">
                  {categoryEdit ? "Изменить категорию" : "Новая категория"}
                </h2>
              </div>
              <button
                className="catalog-editor-close"
                data-testid="category-form-close"
                type="button"
                aria-label="Закрыть редактор категории"
                onClick={() => {
                  setShowCategoryForm(false);
                  setCategoryEdit(null);
                  resetCategory();
                }}
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Кафе</span>
                <select
                  data-testid="category-cafe"
                  {...registerCategory("cafeId")}
                  aria-invalid={Boolean(categoryErrors.cafeId)}
                >
                  <option value="">Выберите кафе</option>
                  {(cafes.data ?? []).map((cafe) => (
                    <option key={cafe.id} value={cafe.id}>
                      {cafe.name}
                      {cafe.isActive ? "" : " · скрыто"}
                    </option>
                  ))}
                </select>
                <small>
                  Смена кафе переносит категорию вместе со всеми блюдами.
                </small>
                <FormFieldError message={categoryErrors.cafeId?.message} />
              </label>
              <label>
                <span>Название</span>
                <input
                  data-testid="category-name"
                  {...registerCategory("name")}
                  aria-invalid={Boolean(categoryErrors.name)}
                  maxLength={100}
                />
                <FormFieldError message={categoryErrors.name?.message} />
              </label>
              <label>
                <span>Кухонный аппарат</span>
                <select
                  data-testid="category-receipt-printer-select"
                  {...registerCategory("receiptPrinterId")}
                  aria-invalid={Boolean(categoryErrors.receiptPrinterId)}
                >
                  <option value="">Без кухонного аппарата</option>
                  {(receiptPrinters.data ?? []).map((printer) => (
                    <option
                      key={printer.id}
                      value={printer.id}
                      disabled={
                        !printer.isActive &&
                        printer.id !== categoryEdit?.receiptPrinterId
                      }
                    >
                      {printer.name} · {printer.ipAddress}:{printer.port}
                      {printer.isActive ? "" : " · отключён"}
                    </option>
                  ))}
                </select>
                <FormFieldError
                  message={categoryErrors.receiptPrinterId?.message}
                />
                <small>
                  Все блюда категории наследуют этот аппарат, если у блюда не
                  указан собственный аппарат.
                </small>
              </label>
              <label>
                <span>Порядок</span>
                <input
                  data-testid="category-sort-order"
                  {...registerCategory("sortOrder", { valueAsNumber: true })}
                  aria-invalid={Boolean(categoryErrors.sortOrder)}
                  type="number"
                />
                <FormFieldError message={categoryErrors.sortOrder?.message} />
              </label>
              <label>
                <span>Изображение до 5 МБ</span>
                <input
                  data-testid="category-image"
                  {...registerCategory("image")}
                  type="file"
                  accept="image/*"
                />
              </label>
              <label className="check-field">
                <input
                  data-testid="category-active"
                  {...registerCategory("isActive")}
                  type="checkbox"
                />
                Активна
              </label>
            </div>
            <button
              className="primary-button"
              data-testid="category-save"
              disabled={
                actions.uploadImage.isPending ||
                actions.createCategory.isPending ||
                actions.updateCategory.isPending
              }
            >
              Сохранить категорию
            </button>
          </form>
        </div>
      )}

      {showProductForm && (
        <div
          className="modal-backdrop catalog-editor-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setShowProductForm(false);
              setProductEdit(null);
              setStoredProductImages([]);
              setSelectedProductFiles([]);
              setProductImageError("");
              resetProduct();
            }
          }}
        >
          <form
            className="editor-card catalog-editor-modal"
            data-testid="product-form"
            noValidate
            onSubmit={handleProductSubmit(submitProduct)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
          >
            <div className="editor-title catalog-editor-title">
              <div>
                <h2 id="product-editor-title">
                  {productEdit ? "Изменить блюдо" : "Новое блюдо"}
                </h2>
              </div>
              <button
                className="catalog-editor-close"
                data-testid="product-form-close"
                type="button"
                aria-label="Закрыть редактор блюда"
                onClick={() => {
                  setShowProductForm(false);
                  setProductEdit(null);
                  setStoredProductImages([]);
                  setSelectedProductFiles([]);
                  setProductImageError("");
                  resetProduct();
                }}
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                <span>Категория</span>
                <select
                  data-testid="product-category"
                  {...registerProduct("categoryId")}
                  aria-invalid={Boolean(productErrors.categoryId)}
                >
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.cafe.name} · {category.name}
                    </option>
                  ))}
                </select>
                <FormFieldError message={productErrors.categoryId?.message} />
              </label>
              <label>
                <span>Название</span>
                <input
                  data-testid="product-name"
                  {...registerProduct("name")}
                  aria-invalid={Boolean(productErrors.name)}
                />
                <FormFieldError message={productErrors.name?.message} />
              </label>
              <label>
                <span>Как продаётся блюдо</span>
                <select
                  data-testid="product-pricing-type"
                  {...registerProduct("pricingType", {
                    onChange(event) {
                      if (event.target.value === "FIXED") {
                        replaceProductVariants([]);
                        setProductValue("variantLabel", "", {
                          shouldDirty: true,
                        });
                      }
                    },
                  })}
                >
                  <option value="FIXED">Одна цена</option>
                  <option value="VARIANT">Несколько вариантов</option>
                </select>
                <small>
                  Варианты подходят для размера, начинки или способа нарезки.
                </small>
              </label>
              {watchedPricingType === "FIXED" && (
                <label>
                  <span>Цена TMT</span>
                  <input
                    data-testid="product-price"
                    {...registerProduct("price", { valueAsNumber: true })}
                    aria-invalid={Boolean(productErrors.price)}
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <FormFieldError message={productErrors.price?.message} />
                  <small>Полная цена блюда без вариантов.</small>
                </label>
              )}
              <label>
                <span>Время приготовления, минут</span>
                <input
                  data-testid="product-preparation-minutes"
                  type="number"
                  min="0"
                  max="1440"
                  {...registerProduct("preparationMinutes", {
                    valueAsNumber: true,
                  })}
                  aria-invalid={Boolean(productErrors.preparationMinutes)}
                />
                <FormFieldError
                  message={productErrors.preparationMinutes?.message}
                />
                <small>
                  Чек для быстрого блюда выйдет позже, чтобы блюда были готовы
                  одновременно.
                </small>
              </label>
              <label>
                <span>Баллы за одно блюдо</span>
                <input
                  data-testid="product-loyalty-points"
                  type="number"
                  min="1"
                  max="100000"
                  {...registerProduct("loyaltyPoints", { valueAsNumber: true })}
                  aria-invalid={Boolean(productErrors.loyaltyPoints)}
                />
                <FormFieldError message={productErrors.loyaltyPoints?.message} />
              </label>
              <label>
                <span>Свой чековый аппарат</span>
                <select
                  data-testid="product-receipt-printer-select"
                  {...registerProduct("receiptPrinterId")}
                  aria-invalid={Boolean(productErrors.receiptPrinterId)}
                >
                  <option value="">Наследовать аппарат категории</option>
                  {(receiptPrinters.data ?? []).map((printer) => (
                    <option
                      key={printer.id}
                      value={printer.id}
                      disabled={
                        !printer.isActive &&
                        printer.id !== productEdit?.receiptPrinterId
                      }
                    >
                      {printer.name} · {printer.ipAddress}:{printer.port}
                      {printer.isActive ? "" : " · отключён"}
                    </option>
                  ))}
                </select>
                <FormFieldError
                  message={productErrors.receiptPrinterId?.message}
                />
                <small>
                  Необязательно. Выбранный аппарат полностью заменяет аппарат
                  категории: блюдо печатается только здесь. Пустой выбор
                  наследует аппарат категории.
                </small>
              </label>
              <label>
                <span>Порядок</span>
                <input
                  data-testid="product-sort-order"
                  {...registerProduct("sortOrder", { valueAsNumber: true })}
                  aria-invalid={Boolean(productErrors.sortOrder)}
                  type="number"
                />
                <FormFieldError message={productErrors.sortOrder?.message} />
              </label>
              {watchedPricingType === "VARIANT" && (
                <section
                  className="wide-field product-variants-editor"
                  data-testid="product-variants-editor"
                >
                  <div className="product-variants-heading">
                    <div>
                      <strong>Варианты блюда</strong>
                      <small>
                        Размер пиццы, способ нарезки или любой другой выбор с
                        отдельной ценой и фотографиями.
                      </small>
                    </div>
                    <button
                      className="secondary-button compact"
                      data-testid="product-variant-add"
                      type="button"
                      onClick={() =>
                        appendProductVariant({
                          name: "",
                          description: "",
                          price: getProductValues("price") || 0,
                          sortOrder: productVariantFields.length,
                          isActive: true,
                          imageUrls: [],
                          imageFiles: undefined,
                        })
                      }
                    >
                      + Добавить вариант
                    </button>
                  </div>
                  {productVariantFields.length > 0 && (
                    <label className="product-variant-label-field">
                      <span>Название выбора для клиента</span>
                      <input
                        data-testid="product-variant-label"
                        {...registerProduct("variantLabel")}
                        aria-invalid={Boolean(productErrors.variantLabel)}
                        placeholder="Например: Размер или Способ нарезки"
                        maxLength={80}
                      />
                      <FormFieldError
                        message={productErrors.variantLabel?.message}
                      />
                    </label>
                  )}
                  <div className="product-variant-list">
                    {productVariantFields.map((field, index) => {
                      const variant = watchedProductVariants[index];
                      const storedUrls = variant?.imageUrls ?? [];
                      const selectedFiles = Array.from(
                        (variant?.imageFiles as FileList | undefined) ?? [],
                      );
                      const variantError = productErrors.variants?.[index];
                      const variantTestId = variant?.id ?? field.formKey;
                      return (
                        <article
                          className="product-variant-card"
                          data-testid={`product-variant-card-${variantTestId}`}
                          key={field.formKey}
                        >
                          <header>
                            <strong>Вариант {index + 1}</strong>
                            <button
                              className="text-button danger"
                              data-testid={`product-variant-toggle-${variantTestId}`}
                              type="button"
                              onClick={() => {
                                if (variant?.id) {
                                  setProductValue(
                                    `variants.${index}.isActive`,
                                    !variant.isActive,
                                    { shouldDirty: true },
                                  );
                                } else {
                                  removeProductVariant(index);
                                }
                              }}
                            >
                              {variant?.id
                                ? variant.isActive
                                  ? "Убрать из продажи"
                                  : "Вернуть в продажу"
                                : "Удалить"}
                            </button>
                          </header>
                          <div className="product-variant-fields">
                            <label>
                              <span>Название</span>
                              <input
                                data-testid={`product-variant-name-${variantTestId}`}
                                {...registerProduct(`variants.${index}.name`)}
                                aria-invalid={Boolean(variantError?.name)}
                                placeholder="Маленькая, 25 см"
                                maxLength={120}
                              />
                              <FormFieldError
                                message={variantError?.name?.message}
                              />
                            </label>
                            <label>
                              <span>Цена TMT</span>
                              <input
                                data-testid={`product-variant-price-${variantTestId}`}
                                {...registerProduct(`variants.${index}.price`, {
                                  valueAsNumber: true,
                                })}
                                aria-invalid={Boolean(variantError?.price)}
                                type="number"
                                min="0"
                                step="0.01"
                              />
                              <FormFieldError
                                message={variantError?.price?.message}
                              />
                            </label>
                            <label>
                              <span>Порядок</span>
                              <input
                                data-testid={`product-variant-sort-${variantTestId}`}
                                {...registerProduct(
                                  `variants.${index}.sortOrder`,
                                  { valueAsNumber: true },
                                )}
                                aria-invalid={Boolean(variantError?.sortOrder)}
                                type="number"
                              />
                              <FormFieldError
                                message={variantError?.sortOrder?.message}
                              />
                            </label>
                            <label className="check-field">
                              <input
                                data-testid={`product-variant-active-${variantTestId}`}
                                {...registerProduct(
                                  `variants.${index}.isActive`,
                                )}
                                type="checkbox"
                              />
                              В продаже
                            </label>
                            <label className="wide-field">
                              <span>Описание варианта (необязательно)</span>
                              <input
                                data-testid={`product-variant-description-${variantTestId}`}
                                {...registerProduct(
                                  `variants.${index}.description`,
                                )}
                                aria-invalid={Boolean(
                                  variantError?.description,
                                )}
                                maxLength={300}
                              />
                              <FormFieldError
                                message={variantError?.description?.message}
                              />
                            </label>
                          </div>
                          {storedUrls.length > 0 && (
                            <div className="product-variant-images">
                              {storedUrls.map((url, imageIndex) => (
                                <div key={`${url}-${imageIndex}`}>
                                  <img
                                    src={resolveApiUrl(url)}
                                    alt=""
                                    loading="lazy"
                                    width={88}
                                    height={64}
                                  />
                                  <button
                                    className="text-button"
                                    data-testid={`product-variant-image-remove-${variantTestId}-${imageIndex}`}
                                    type="button"
                                    aria-label={`Убрать фото варианта ${imageIndex + 1}`}
                                    onClick={() =>
                                      setProductValue(
                                        `variants.${index}.imageUrls`,
                                        storedUrls.filter(
                                          (_, candidateIndex) =>
                                            candidateIndex !== imageIndex,
                                        ),
                                        { shouldDirty: true },
                                      )
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <label
                            className={
                              dragOverKey === `variant-${index}`
                                ? "product-file-picker is-dragging"
                                : "product-file-picker"
                            }
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragOverKey(`variant-${index}`);
                            }}
                            onDragLeave={(event) => {
                              event.preventDefault();
                              setDragOverKey((key) =>
                                key === `variant-${index}` ? null : key,
                              );
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              setDragOverKey(null);
                              const files = imageFilesFromDrop(event);
                              if (!files.length) return;
                              setProductValue(
                                `variants.${index}.imageFiles`,
                                files,
                                { shouldDirty: true },
                              );
                            }}
                          >
                            <span>
                              Фото варианта:{" "}
                              {storedUrls.length + selectedFiles.length}/
                              {MAX_PRODUCT_IMAGES} (или перетащите сюда)
                            </span>
                            <input
                              data-testid={`product-variant-images-${variantTestId}`}
                              {...registerProduct(
                                `variants.${index}.imageFiles`,
                              )}
                              type="file"
                              accept="image/*"
                              multiple
                            />
                          </label>
                          {selectedFiles.length > 0 && (
                            <small className="product-variant-file-names">
                              Будут добавлены:{" "}
                              {selectedFiles.map(({ name }) => name).join(", ")}
                            </small>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
              <div className="wide-field product-image-editor">
                <div className="product-image-heading">
                  <span>Изображения блюда</span>
                  <small>
                    {storedProductImages.length + selectedProductFiles.length}/
                    {MAX_PRODUCT_IMAGES}. Первое изображение будет главным.
                  </small>
                </div>
                {storedProductImages.length > 0 && (
                  <div className="product-image-grid">
                    {storedProductImages.map((image, index) => (
                      <article className="product-image-card" key={image.id}>
                        <img
                          src={resolveApiUrl(image.url)}
                          alt={image.alt ?? ""}
                          loading="lazy"
                          width={160}
                          height={110}
                        />
                        <div>
                          <small>
                            {index === 0 ? "Главное" : `Фото ${index + 1}`}
                          </small>
                          <button
                            className="text-button"
                            type="button"
                            aria-label={`Убрать изображение ${index + 1}`}
                            onClick={() =>
                              setStoredProductImages((images) =>
                                images.filter(({ id }) => id !== image.id),
                              )
                            }
                          >
                            Убрать
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                <label
                  className={
                    dragOverKey === "product"
                      ? "product-file-picker is-dragging"
                      : "product-file-picker"
                  }
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverKey("product");
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragOverKey((key) => (key === "product" ? null : key));
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOverKey(null);
                    const files = imageFilesFromDrop(event);
                    if (!files.length) return;
                    if (
                      !canAddProductImages(
                        storedProductImages.length,
                        files.length,
                      )
                    ) {
                      setSelectedProductFiles([]);
                      setProductImageError(
                        `Можно сохранить не больше ${MAX_PRODUCT_IMAGES} изображений.`,
                      );
                      return;
                    }
                    setSelectedProductFiles(files);
                    setProductImageError("");
                  }}
                >
                  <span>Добавить файлы до 5 МБ каждый или перетащите сюда</span>
                  <input
                    data-testid="product-images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      if (
                        !canAddProductImages(
                          storedProductImages.length,
                          files.length,
                        )
                      ) {
                        setSelectedProductFiles([]);
                        setProductImageError(
                          `Можно сохранить не больше ${MAX_PRODUCT_IMAGES} изображений.`,
                        );
                        event.currentTarget.value = "";
                        return;
                      }
                      setSelectedProductFiles(files);
                      setProductImageError("");
                    }}
                  />
                </label>
                {selectedProductFiles.length > 0 && (
                  <div className="selected-product-files" aria-live="polite">
                    {selectedProductFiles.map((file, index) => (
                      <span
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                      >
                        {storedProductImages.length === 0 && index === 0
                          ? "Главное: "
                          : ""}
                        {file.name}
                        <button
                          className="text-button"
                          type="button"
                          aria-label={`Убрать выбранный файл ${file.name}`}
                          onClick={() =>
                            setSelectedProductFiles((files) =>
                              files.filter((candidate) => candidate !== file),
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <label className="wide-field">
                <span>Описание</span>
                <textarea
                  data-testid="product-description"
                  {...registerProduct("description")}
                  aria-invalid={Boolean(productErrors.description)}
                  rows={3}
                  maxLength={4000}
                />
                <FormFieldError message={productErrors.description?.message} />
              </label>
              <label className="check-field">
                <input
                  data-testid="product-active"
                  {...registerProduct("isActive")}
                  type="checkbox"
                />
                В продаже
              </label>
            </div>
            <button
              className="primary-button"
              data-testid="product-save"
              disabled={
                actions.uploadImages.isPending ||
                actions.createProduct.isPending ||
                actions.updateProduct.isPending
              }
            >
              Сохранить блюдо
            </button>
          </form>
        </div>
      )}

      <div className="split-tables">
        {catalogTab === "categories" && (
          <article className="table-card">
            <div className="card-title">
              <h2>Категории</h2>
              <span>
                {filteredCategories.length}
                {hasSearch ? ` / ${categories.data?.length ?? 0}` : ""}
              </span>
            </div>
            <AsyncPanel
              pending={categories.isPending}
              error={categories.error}
              onRetry={() => void categories.refetch()}
            >
              <DataTable
                columns={categoryColumns}
                data={filteredCategories}
                getRowId={(category) => category.id}
                empty="Категорий пока нет"
                label="Категории каталога"
              />
            </AsyncPanel>
          </article>
        )}
        {catalogTab === "products" && (
          <article className="table-card catalog-products-table">
            <div className="card-title">
              <div>
                <h2>Блюда по категориям</h2>
                <small>{productGroups.length} групп</small>
              </div>
              <div className="catalog-accordion-actions">
                <span>
                  {products.data?.total ?? 0}
                  {hasSearch || productCategoryFilter
                    ? ` / ${totalProductCount}`
                    : ""}
                </span>
                <button
                  className="text-button compact"
                  data-testid="catalog-product-groups-collapse"
                  disabled={!expandedProductGroupCount}
                  type="button"
                  onClick={() => setExpandedProductGroups(new Set())}
                >
                  Свернуть все
                </button>
                <button
                  className="text-button compact"
                  data-testid="catalog-product-groups-expand"
                  disabled={
                    !productGroups.length ||
                    expandedProductGroupCount === productGroups.length
                  }
                  type="button"
                  onClick={() => setExpandedProductGroups("all")}
                >
                  Раскрыть все
                </button>
              </div>
            </div>
            <AsyncPanel
              pending={products.isPending}
              error={products.error}
              onRetry={() => void products.refetch()}
            >
              {productGroups.length ? (
                <div
                  className="catalog-product-groups"
                  data-testid="catalog-product-groups"
                >
                  {productGroups.map((group, groupIndex) => {
                    const isExpanded =
                      expandedProductGroups === "all" ||
                      (expandedProductGroups === null
                        ? groupIndex === 0
                        : expandedProductGroups.has(group.id));
                    const panelId = `catalog-product-group-panel-${group.id}`;
                    return (
                      <section
                        className="catalog-product-group"
                        data-testid={`catalog-product-group-${group.id}`}
                        key={group.id}
                      >
                        <header className="catalog-product-group-head">
                          <button
                            aria-controls={panelId}
                            aria-expanded={isExpanded}
                            className="catalog-product-group-toggle"
                            data-testid={`catalog-product-group-toggle-${group.id}`}
                            type="button"
                            onClick={() => toggleProductGroup(group.id)}
                          >
                            <span className="catalog-product-group-title">
                              <strong>{group.name}</strong>
                              <small>
                                {group.products[0]?.category?.cafe.name}
                              </small>
                              {!group.isActive && (
                                <small>Категория скрыта</small>
                              )}
                            </span>
                            <span className="catalog-product-group-meta">
                              <span>{group.products.length}</span>
                              <span
                                aria-hidden="true"
                                className="catalog-product-group-chevron"
                              >
                                ⌄
                              </span>
                            </span>
                          </button>
                        </header>
                        {isExpanded && (
                          <div
                            data-testid={`catalog-product-group-panel-${group.id}`}
                            id={panelId}
                          >
                            <DataTable
                              columns={productColumns}
                              data={group.products}
                              getRowId={(product) => product.id}
                              label={`Блюда категории ${group.name}`}
                            />
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="async-state">Подходящих блюд нет</div>
              )}
            </AsyncPanel>
            {products.data && (
              <CatalogPagination
                page={products.data.page}
                pageSize={products.data.pageSize}
                total={products.data.total}
                totalPages={products.data.totalPages}
                isFetching={products.isFetching}
                onPageChange={(page) => {
                  setProductPage(page);
                  setExpandedProductGroups(null);
                }}
              />
            )}
          </article>
        )}
      </div>
    </section>
  );
}
