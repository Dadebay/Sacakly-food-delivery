import { useState } from "react";
import { useSearchParams } from "react-router";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useInventoryIngredients,
  type Ingredient,
} from "@/src/entities/inventory";
import {
  InventoryDialog,
  ingredientEditorSchema,
  inventoryPurchaseUnits,
  useInventoryActions,
  type IngredientEditorInput,
  type IngredientEditorValues,
} from "@/src/features/inventory-management";
import { FormFieldError } from "@/src/shared/forms";

function IngredientEditor({
  ingredient,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const actions = useInventoryActions();
  const factor = inventoryPurchaseUnits[ingredient?.unit ?? "GRAM"].factor;
  const form = useForm<IngredientEditorInput, unknown, IngredientEditorValues>({
    resolver: zodResolver(ingredientEditorSchema),
    defaultValues: {
      name: ingredient?.name ?? "",
      unit: ingredient?.unit ?? "GRAM",
      costPerUnit: ingredient
        ? String(Number((ingredient.costPerUnit * factor).toFixed(6)))
        : "",
      reorderPoint: ingredient ? String(ingredient.reorderPoint / factor) : "",
    },
  });
  const unit = useWatch({ control: form.control, name: "unit" });
  const purchase = inventoryPurchaseUnits[unit];
  const pending =
    actions.createIngredient.isPending || actions.updateIngredient.isPending;
  const error =
    actions.createIngredient.error ?? actions.updateIngredient.error;
  async function submit(values: IngredientEditorValues) {
    try {
      if (ingredient)
        await actions.updateIngredient.mutateAsync({
          id: ingredient.id,
          payload: {
            name: values.name,
            costPerUnit: values.costPerUnit,
            reorderPoint: values.reorderPoint,
            isActive: ingredient.isActive,
          },
        });
      else await actions.createIngredient.mutateAsync(values);
      onSaved(values.name);
    } catch {
      /* Keep the form available for correction or retry. */
    }
  }
  return (
    <InventoryDialog
      title={ingredient ? "Изменить ингредиент" : "Новый ингредиент"}
      description="Цена нужна для расчёта себестоимости. Остаток добавляется через приход."
      testId="inventory-ingredient-dialog"
      returnFocusTestId={
        ingredient
          ? `inventory-ingredient-edit-${ingredient.id}`
          : "inventory-ingredient-add"
      }
      onClose={onClose}
      busy={pending}
    >
      <form
        className="inventory-form"
        data-testid="inventory-ingredient-form"
        onSubmit={form.handleSubmit(submit)}
        noValidate
      >
        <fieldset disabled={pending}>
          <label>
            Название
            <input
              placeholder="Например, рис"
              data-testid="inventory-ingredient-name"
              {...form.register("name")}
            />
            <FormFieldError message={form.formState.errors.name?.message} />
          </label>
          <label>
            Как измеряем
            <select
              data-testid="inventory-ingredient-unit"
              {...form.register("unit")}
              disabled={Boolean(ingredient)}
            >
              <option value="GRAM">Вес — килограммы</option>
              <option value="MILLILITER">Объём — литры</option>
              <option value="PIECE">Количество — штуки</option>
            </select>
          </label>
          <div className="inventory-two-fields">
            <label>
              Цена за 1 {purchase.label}, TMT
              <input
                inputMode="decimal"
                placeholder="Например, 20"
                data-testid="inventory-ingredient-cost"
                {...form.register("costPerUnit")}
              />
              <FormFieldError
                message={form.formState.errors.costPerUnit?.message}
              />
            </label>
            <label>
              Минимальный запас, {purchase.label}
              <input
                inputMode="decimal"
                placeholder="Например, 5"
                data-testid="inventory-ingredient-threshold"
                {...form.register("reorderPoint")}
              />
              <FormFieldError
                message={form.formState.errors.reorderPoint?.message}
              />
            </label>
          </div>
          <p className="inventory-hint">
            Когда запас достигнет минимума, появится «Заканчивается». Укажите 0,
            если порог не нужен.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error.message}
            </p>
          )}
          <div className="inventory-form-actions">
            <button
              type="button"
              className="secondary-button"
              data-testid="inventory-ingredient-cancel"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="inventory-ingredient-save"
            >
              {pending
                ? "Сохраняем…"
                : ingredient
                  ? "Сохранить изменения"
                  : "Добавить ингредиент"}
            </button>
          </div>
        </fieldset>
      </form>
    </InventoryDialog>
  );
}
export function IngredientManager({ onReceive }: { onReceive: () => void }) {
  const query = useInventoryIngredients();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState("");
  const adding = params.get("new") === "1";
  function setAdding(value: boolean) {
    const next = new URLSearchParams(params);
    if (value) next.set("new", "1");
    else next.delete("new");
    setParams(next, { replace: true });
  }
  const visible = query.data?.filter((item) =>
    item.name
      .toLocaleLowerCase("ru")
      .includes(search.trim().toLocaleLowerCase("ru")),
  );
  return (
    <section data-testid="inventory-ingredients">
      <div className="inventory-view-head">
        <div>
          <h2>Ингредиенты</h2>
          <p>Закупочные цены и минимальные запасы для всех филиалов.</p>
        </div>
        <button
          type="button"
          className="primary-button"
          data-testid="inventory-ingredient-add"
          onClick={() => setAdding(true)}
        >
          + Добавить ингредиент
        </button>
      </div>
      {saved && (
        <div className="inventory-notice" role="status">
          {saved}{" "}
          <button
            type="button"
            className="text-button"
            data-testid="inventory-ingredient-receive"
            onClick={onReceive}
          >
            Оформить приход →
          </button>
        </div>
      )}
      <label className="inventory-search">
        <span className="sr-only">Поиск ингредиента</span>
        <input
          type="search"
          placeholder="Найти ингредиент…"
          data-testid="inventory-ingredient-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {query.isPending ? (
        <div className="inventory-skeleton" role="status">
          Загружаем ингредиенты…
        </div>
      ) : query.error ? (
        <div className="inventory-empty" role="alert">
          <p>{query.error.message}</p>
          <button
            className="secondary-button"
            data-testid="inventory-ingredient-retry"
            onClick={() => void query.refetch()}
          >
            Повторить
          </button>
        </div>
      ) : !visible?.length ? (
        <div className="inventory-empty">
          <h3>
            {search ? "Ничего не найдено" : "Какие продукты использует кухня?"}
          </h3>
          <p>
            {search
              ? "Попробуйте другое название."
              : "Добавьте первый ингредиент, чтобы настроить остатки и рецептуры."}
          </p>
          {!search && (
            <button
              className="primary-button"
              data-testid="inventory-ingredient-first"
              onClick={() => setAdding(true)}
            >
              Добавить ингредиент
            </button>
          )}
        </div>
      ) : (
        <div className="ingredient-list">
          {visible.map((item) => {
            const purchase = inventoryPurchaseUnits[item.unit];
            return (
              <article
                className="ingredient-row"
                key={item.id}
                data-testid={`inventory-ingredient-row-${item.id}`}
              >
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.isActive ? "" : "Выключен"}</span>
                </div>
                <div>
                  <span>Закупочная цена</span>
                  <strong>
                    {(item.costPerUnit * purchase.factor).toLocaleString(
                      "ru-RU",
                      { maximumFractionDigits: 6 },
                    )}{" "}
                    <small>TMT / {purchase.label}</small>
                  </strong>
                </div>
                <div>
                  <span>Минимальный запас</span>
                  <strong>
                    {(item.reorderPoint / purchase.factor).toLocaleString(
                      "ru-RU",
                      { maximumFractionDigits: 6 },
                    )}{" "}
                    <small>{purchase.label}</small>
                  </strong>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  data-testid={`inventory-ingredient-edit-${item.id}`}
                  onClick={() => setEditing(item)}
                >
                  Изменить
                </button>
              </article>
            );
          })}
        </div>
      )}
      {(adding || editing) && (
        <IngredientEditor
          ingredient={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
          onSaved={(name) => {
            setSaved(
              `${name}: ${editing ? "изменения сохранены." : "ингредиент добавлен. Теперь укажите остаток на складе."}`,
            );
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}
