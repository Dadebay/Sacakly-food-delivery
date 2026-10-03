import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  catalogQueryKeys,
  type Cafe,
  type CategorySummary,
  type CreateCafe,
  type CreateCategory,
  type CreateProduct,
  type CreateReceiptPrinter,
  type MediaUpload,
  type Product,
  type ReceiptPrinter,
  type ReceiptPrintSettings,
  type UpdateCategory,
  type UpdateCafe,
  type UpdateProduct,
  type UpdateReceiptPrinter,
  type UpdateReceiptPrintSettings,
} from "@/src/entities/catalog";
import { useSession } from "@/src/shared/auth";

export function useCatalogActions() {
  const { authorizedRequest } = useSession();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
  const uploadImageFile = (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return authorizedRequest<MediaUpload>("/media/images", {
      method: "POST",
      body,
    });
  };

  const uploadImage = useMutation({
    mutationFn: uploadImageFile,
  });
  const uploadImages = useMutation({
    mutationFn: (files: File[]) =>
      Promise.all(files.map((file) => uploadImageFile(file))),
  });
  const createCafe = useMutation({
    mutationFn: (body: CreateCafe) =>
      authorizedRequest<Cafe>("/catalog/cafes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateCafe = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCafe }) =>
      authorizedRequest<Cafe>(`/catalog/cafes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const deleteCafe = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<void>(`/catalog/cafes/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const createCategory = useMutation({
    mutationFn: (body: CreateCategory) =>
      authorizedRequest<CategorySummary>("/catalog/categories", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategory }) =>
      authorizedRequest<CategorySummary>(`/catalog/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<void>(`/catalog/categories/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  const updateReceiptPrintSettings = useMutation({
    mutationFn: (body: UpdateReceiptPrintSettings) =>
      authorizedRequest<ReceiptPrintSettings>(
        "/catalog/receipt-print-settings",
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
    onSuccess: refresh,
  });
  const createReceiptPrinter = useMutation({
    mutationFn: (body: CreateReceiptPrinter) =>
      authorizedRequest<ReceiptPrinter>("/catalog/receipt-printers", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateReceiptPrinter = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReceiptPrinter }) =>
      authorizedRequest<ReceiptPrinter>(`/catalog/receipt-printers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const deleteReceiptPrinter = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<void>(`/catalog/receipt-printers/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  const createProduct = useMutation({
    mutationFn: (body: CreateProduct) =>
      authorizedRequest<Product>("/catalog/products", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const updateProduct = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProduct }) =>
      authorizedRequest<Product>(`/catalog/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: refresh,
  });
  const deleteProduct = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<void>(`/catalog/products/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });
  return {
    uploadImage,
    uploadImages,
    createCafe,
    updateCafe,
    deleteCafe,
    createCategory,
    updateCategory,
    deleteCategory,
    updateReceiptPrintSettings,
    createReceiptPrinter,
    updateReceiptPrinter,
    deleteReceiptPrinter,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
