import { useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  inventoryMovementLabels,
  type StockItem,
} from "@/src/entities/inventory";
import {
  InventoryDialog,
  inventoryPurchaseUnits,
  stockEntrySchema,
  stockDelta,
  useInventoryActions,
  type StockEntryInput,
  type StockAdjustmentFormValues,
} from "@/src/features/inventory-management";
import { FormFieldError } from "@/src/shared/forms";

export function StockAdjustment({
  item,
  initialType,
  onClose,
  onSaved,
}: {
  item: StockItem;
  initialType: "RECEIPT" | "WASTE";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { adjustStock } = useInventoryActions();
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const schema = stockEntrySchema(item.unit);
  const form = useForm<StockEntryInput, unknown, StockAdjustmentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "", type: initialType, reason: "" },
  });
  const values = useWatch({ control: form.control });
  const purchase = inventoryPurchaseUnits[item.unit];
  const parsed = schema.safeParse({
    ...values,
    reason: values.reason || "Предпросмотр",
  });
  const next = parsed.success ? item.quantity + stockDelta(parsed.data) : null;
  const format = (value: number) =>
    `${(value / purchase.factor).toLocaleString("ru-RU", { maximumFractionDigits: 6 })} ${purchase.label}`;
  async function submit(data: StockAdjustmentFormValues) {
    const payload = {
      branchId: item.branchId,
      quantityDelta: stockDelta(data),
      type: data.type,
      reason: data.reason,
    };
    const signature = JSON.stringify({
      ingredientId: item.ingredientId,
      ...payload,
    });
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    try {
      await adjustStock.mutateAsync({
        ingredientId: item.ingredientId,
        payload: { ...payload, idempotencyKey: attempt.current.key },
      });
      onSaved();
    } catch {
      /* Retain input and the idempotency key for safe retry. */
    }
  }
  return (
    <InventoryDialog
      title={
        initialType === "RECEIPT" ? "Приход на склад" : "Списание со склада"
      }
      description={`${item.ingredientName} · ${item.branchName}`}
      testId="inventory-adjustment-dialog"
      returnFocusTestId={`inventory-${initialType === "RECEIPT" ? "receive" : "writeoff"}-${item.branchId}:${item.ingredientId}`}
      onClose={onClose}
      busy={adjustStock.isPending}
    >
      <form
        className="inventory-form"
        data-testid="inventory-adjustment-form"
        onSubmit={(event) => void form.handleSubmit(submit)(event)}
        noValidate
      >
        <fieldset disabled={adjustStock.isPending}>
          <div className="inventory-balance-preview">
            <div>
              <span>Сейчас на складе</span>
              <strong>{format(item.quantity)}</strong>
            </div>
            <b aria-hidden="true">→</b>
            <div>
              <span>После операции</span>
              <strong
                className={next !== null && next < 0 ? "error-text" : ""}
                data-testid="inventory-adjustment-preview"
              >
                {next === null ? "—" : format(next)}
              </strong>
            </div>
          </div>
          <label>
            Операция
            <select
              data-testid="inventory-adjustment-type"
              {...form.register("type")}
            >
              {Object.entries(inventoryMovementLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Количество, {purchase.label}
            <input
              inputMode="decimal"
              placeholder={
                purchase.factor === 1000 ? "Например, 2,5" : "Например, 10"
              }
              data-testid="inventory-adjustment-amount"
              {...form.register("amount")}
              aria-invalid={Boolean(form.formState.errors.amount)}
            />
            <FormFieldError message={form.formState.errors.amount?.message} />
          </label>
          {values.type === "ADJUSTMENT" && (
            <p className="inventory-hint">
              Введите изменение со знаком: +2 добавит две единицы, −2 уберёт
              две.
            </p>
          )}
          {next !== null && next < 0 && (
            <p role="status" className="error-text">
              Остатка недостаточно. Проверьте количество.
            </p>
          )}
          <label>
            Основание операции
            <input
              placeholder={
                values.type === "RECEIPT"
                  ? "Например, накладная № 123"
                  : "Например, испорчено при хранении"
              }
              data-testid="inventory-adjustment-reason"
              {...form.register("reason")}
              aria-invalid={Boolean(form.formState.errors.reason)}
            />
            <FormFieldError message={form.formState.errors.reason?.message} />
          </label>
          <p className="inventory-hint">
            Операция, причина и автор сохраняются в журнале учёта.
          </p>
          {adjustStock.error && (
            <p className="error-text" role="alert">
              {adjustStock.error.message}
            </p>
          )}
          <div className="inventory-form-actions">
            <button
              className="secondary-button"
              type="button"
              data-testid="inventory-adjustment-cancel"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              className="primary-button"
              type="submit"
              data-testid="inventory-adjustment-save"
              disabled={next !== null && next < 0}
            >
              {adjustStock.isPending ? "Сохраняем…" : "Подтвердить операцию"}
            </button>
          </div>
        </fieldset>
      </form>
    </InventoryDialog>
  );
}
