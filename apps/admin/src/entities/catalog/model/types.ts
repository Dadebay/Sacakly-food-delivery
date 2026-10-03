import type { components } from "@alowalow/api-contract";

export type Category = components["schemas"]["CatalogAdminCategoryResponseDto"];
export type Cafe = components["schemas"]["CatalogAdminCafeResponseDto"];
export type CategorySummary =
  components["schemas"]["CatalogAdminCategorySummaryResponseDto"];
export type CategoryListItem =
  components["schemas"]["CatalogAdminCategoryListItemResponseDto"];
export type Product = components["schemas"]["CatalogAdminProductResponseDto"];
export type ProductPage =
  components["schemas"]["CatalogAdminProductPageResponseDto"];
export type ReceiptPrintSettings =
  components["schemas"]["ReceiptPrintSettingsResponseDto"];
export type ReceiptPrinter = components["schemas"]["ReceiptPrinterResponseDto"];
export type CreateCategory = components["schemas"]["CreateCategoryDto"];
export type UpdateCategory = components["schemas"]["UpdateCategoryDto"];
export type CreateCafe = components["schemas"]["CreateCafeDto"];
export type UpdateCafe = components["schemas"]["UpdateCafeDto"];
export type CreateProduct = components["schemas"]["CreateProductDto"];
export type UpdateProduct = components["schemas"]["UpdateProductDto"];
export type UpdateReceiptPrintSettings =
  components["schemas"]["UpdateReceiptPrintSettingsDto"];
export type CreateReceiptPrinter =
  components["schemas"]["CreateReceiptPrinterDto"];
export type UpdateReceiptPrinter =
  components["schemas"]["UpdateReceiptPrinterDto"];
export type MediaUpload = components["schemas"]["MediaUploadResponseDto"];
