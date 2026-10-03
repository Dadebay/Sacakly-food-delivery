import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Product, ReceiptPrinter } from "@/src/entities/catalog";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowTurnBackwardIcon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";
import { FormFieldError } from "@/src/shared/forms";
import {
  categoryReceiptRouteFormSchema,
  type CategoryReceiptRouteFormValues,
} from "../model/catalog-forms";

export function ProductReceiptRoute({
  product,
  printers,
  canEdit,
  isPending,
  onSave,
}: {
  product: Product;
  printers: ReceiptPrinter[];
  canEdit: boolean;
  isPending: boolean;
  onSave: (product: Product, receiptPrinterId: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CategoryReceiptRouteFormValues>({
    resolver: zodResolver(categoryReceiptRouteFormSchema),
    mode: "onBlur",
    values: { receiptPrinterId: product.receiptPrinterId ?? "" },
  });

  if (!canEdit) {
    return (
      <div className="primary-cell">
        <strong>
          {product.effectiveReceiptPrinter?.name ??
            product.effectiveReceiptPrinterIp ??
            "Не назначен"}
        </strong>
        <small>
          {product.receiptPrinterId || product.receiptPrinterIp
            ? "Свой аппарат · приоритет над категорией"
            : product.effectiveReceiptPrinterId ||
                product.effectiveReceiptPrinterIp
              ? "Наследуется от категории"
              : "Маршрут не назначен"}
        </small>
      </div>
    );
  }

  return (
    <form
      className="product-printer-route"
      data-testid={`product-printer-route-${product.id}`}
      noValidate
      onSubmit={handleSubmit((values) =>
        onSave(product, values.receiptPrinterId),
      )}
    >
      <label>
        <span className="visually-hidden">
          Свой чековый аппарат для блюда {product.name}
        </span>
        <select
          data-testid={`product-printer-select-${product.id}`}
          {...register("receiptPrinterId")}
          aria-invalid={Boolean(errors.receiptPrinterId)}
          disabled={isPending}
        >
          <option value="">Наследовать аппарат категории</option>
          {printers.map((printer) => (
            <option
              key={printer.id}
              value={printer.id}
              disabled={
                !printer.isActive && printer.id !== product.receiptPrinterId
              }
            >
              {printer.name} · {printer.ipAddress}:{printer.port}
              {printer.isActive ? "" : " · отключён"}
            </option>
          ))}
        </select>
        <FormFieldError message={errors.receiptPrinterId?.message} />
      </label>
      <small>
        {product.receiptPrinterId || product.receiptPrinterIp
          ? "Свой аппарат: категория не используется"
          : product.effectiveReceiptPrinter
            ? `Сейчас от категории: ${product.effectiveReceiptPrinter.name}`
            : product.effectiveReceiptPrinterIp
              ? `Сейчас от категории: ${product.effectiveReceiptPrinterIp}`
              : "Сейчас принтер не назначен"}
      </small>
      <div className="product-printer-route-actions">
        <button
          aria-label="Сохранить аппарат"
          title="Сохранить аппарат"
          className="secondary-button compact icon-action-button"
          data-testid={`product-printer-save-${product.id}`}
          disabled={!isDirty || isPending}
        >
          <HugeiconsIcon icon={FloppyDiskIcon} size={16} strokeWidth={1.8} />
        </button>
        <button
          aria-label="Наследовать категорию"
          title="Наследовать категорию"
          className="text-button compact icon-action-button"
          data-testid={`product-printer-clear-${product.id}`}
          disabled={
            (!product.receiptPrinterId && !product.receiptPrinterIp) ||
            isPending
          }
          type="button"
          onClick={() => void onSave(product, "")}
        >
          <HugeiconsIcon
            icon={ArrowTurnBackwardIcon}
            size={16}
            strokeWidth={1.8}
          />
        </button>
      </div>
    </form>
  );
}
