import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  FloppyDiskIcon,
  PrinterOffIcon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import type { CategoryListItem, ReceiptPrinter } from "@/src/entities/catalog";
import { FormFieldError } from "@/src/shared/forms";
import {
  categoryReceiptRouteFormSchema,
  type CategoryReceiptRouteFormValues,
} from "../model/catalog-forms";

function CategoryReceiptRouteRow({
  category,
  printers,
  canEdit,
  isPending,
  onSave,
  onClear,
  onDelete,
  onToggleActive,
}: {
  category: CategoryListItem;
  printers: ReceiptPrinter[];
  canEdit: boolean;
  isPending: boolean;
  onSave: (
    category: CategoryListItem,
    values: CategoryReceiptRouteFormValues,
  ) => Promise<void>;
  onClear: (category: CategoryListItem) => Promise<void>;
  onDelete: (category: CategoryListItem) => void;
  onToggleActive: (category: CategoryListItem) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CategoryReceiptRouteFormValues>({
    resolver: zodResolver(categoryReceiptRouteFormSchema),
    mode: "onBlur",
    values: { receiptPrinterId: category.receiptPrinterId ?? "" },
  });

  return (
    <form
      className="category-printer-route-row"
      data-testid={`category-printer-route-${category.id}`}
      noValidate
      onSubmit={handleSubmit((values) => onSave(category, values))}
    >
      <div className="category-printer-route-name">
        <strong>{category.name}</strong>
        <small>
          {category.cafe.name} · {category.productCount} блюд ·{" "}
          <span
            className={
              category.isActive
                ? "category-visibility-state active"
                : "category-visibility-state hidden"
            }
          >
            {category.isActive ? "видна клиентам" : "скрыта от клиентов"}
          </span>
        </small>
      </div>
      <label>
        <span className="visually-hidden">
          Кухонный X-принтер для категории {category.name}
        </span>
        <select
          data-testid={`category-printer-select-${category.id}`}
          {...register("receiptPrinterId")}
          aria-invalid={Boolean(errors.receiptPrinterId)}
          aria-label={`Кухонный X-принтер для категории ${category.name}`}
          disabled={!canEdit || isPending}
        >
          <option value="">Без кухонного аппарата</option>
          {printers.map((printer) => (
            <option
              key={printer.id}
              value={printer.id}
              disabled={
                !printer.isActive && printer.id !== category.receiptPrinterId
              }
            >
              {printer.name} · {printer.ipAddress}:{printer.port}
              {printer.isActive ? "" : " · отключён"}
            </option>
          ))}
        </select>
        <FormFieldError message={errors.receiptPrinterId?.message} />
      </label>
      {canEdit ? (
        // Dort satir metin butonu her kategoride tekrar ediyordu; ikon +
        // title ayni islemleri tek satirda veriyor.
        <div className="category-printer-route-actions">
          <button
            aria-label="Сохранить аппарат"
            title={isPending ? "Сохраняем…" : "Сохранить аппарат"}
            className="secondary-button compact icon-action-button"
            data-testid={`category-printer-save-${category.id}`}
            disabled={!isDirty || isPending}
          >
            <HugeiconsIcon icon={FloppyDiskIcon} size={16} strokeWidth={1.8} />
          </button>
          <button
            aria-label="Убрать аппарат"
            title="Убрать аппарат"
            className="text-button icon-action-button"
            data-testid={`category-printer-clear-${category.id}`}
            disabled={
              (!category.receiptPrinterId && !category.receiptPrinterIp) ||
              isPending
            }
            type="button"
            onClick={() => void onClear(category)}
          >
            <HugeiconsIcon icon={PrinterOffIcon} size={16} strokeWidth={1.8} />
          </button>
          <button
            aria-label={
              category.isActive ? "Скрыть категорию" : "Показать категорию"
            }
            title={
              category.isActive ? "Скрыть категорию" : "Показать категорию"
            }
            className="text-button icon-action-button"
            data-testid={`category-visibility-${category.id}`}
            disabled={isPending}
            type="button"
            onClick={() => onToggleActive(category)}
          >
            <HugeiconsIcon
              icon={category.isActive ? ViewOffIcon : ViewIcon}
              size={16}
              strokeWidth={1.8}
            />
          </button>
          <button
            aria-label="Удалить категорию"
            title="Удалить категорию"
            className="text-button icon-action-button danger"
            data-testid={`category-delete-open-${category.id}`}
            disabled={isPending}
            type="button"
            onClick={() => onDelete(category)}
          >
            <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <span className="category-printer-route-readonly">
          Только администратор
        </span>
      )}
    </form>
  );
}

export function CategoryReceiptRoutes({
  categories,
  printers,
  canEdit,
  isPending,
  isLoading,
  onRetry,
  onSave,
  onClear,
  onDelete,
  onToggleActive,
}: {
  categories: CategoryListItem[];
  printers: ReceiptPrinter[];
  canEdit: boolean;
  isPending: boolean;
  isLoading: boolean;
  onRetry: () => void;
  onSave: (
    category: CategoryListItem,
    values: CategoryReceiptRouteFormValues,
  ) => Promise<void>;
  onClear: (category: CategoryListItem) => Promise<void>;
  onDelete: (category: CategoryListItem) => void;
  onToggleActive: (category: CategoryListItem) => void;
}) {
  return (
    <section
      className="table-card category-printer-routes"
      data-testid="category-printer-routes"
      aria-labelledby="category-printer-routes-title"
    >
      <header>
        <div>
          <span className="eyebrow">КУХОННЫЕ КОПИИ</span>
          <h2 id="category-printer-routes-title">Категории и X-принтеры</h2>
        </div>
        <p>
          Назначьте категории стандартный аппарат. Если блюду назначен свой, он
          имеет приоритет и копия на аппарат категории не дублируется.
        </p>
      </header>

      {isLoading ? (
        <div className="category-printer-routes-state">
          Загружаем категории…
        </div>
      ) : categories.length ? (
        <div className="category-printer-route-list">
          {categories.map((category) => (
            <CategoryReceiptRouteRow
              key={category.id}
              category={category}
              printers={printers}
              canEdit={canEdit}
              isPending={isPending}
              onSave={onSave}
              onClear={onClear}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      ) : (
        <div className="category-printer-routes-state">
          <span>Категории не загрузились или ещё не созданы.</span>
          <button
            className="text-button compact"
            type="button"
            onClick={onRetry}
          >
            Повторить
          </button>
        </div>
      )}

      <small className="category-printer-routes-note">
        Аппараты добавляются в реестре выше. Пустой выбор отключает маршрут
        категории для блюд без собственного аппарата.
      </small>
    </section>
  );
}
