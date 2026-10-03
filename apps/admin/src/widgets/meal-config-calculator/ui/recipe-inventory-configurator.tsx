import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAdminProducts } from "@/src/entities/catalog";
import {
  inventoryUnitLabels,
  useInventoryIngredients,
  useInventoryRecipes,
  type Ingredient,
  type Recipe,
} from "@/src/entities/inventory";
import {
  recipeFormSchema,
  useInventoryActions,
  type RecipeFormInput,
  type RecipeFormValues,
} from "@/src/features/inventory-management";
import { FormFieldError } from "@/src/shared/forms";

function RecipeEditor({
  productId,
  name,
  recipe,
  ingredients,
  onBack,
  onDirtyChange,
}: {
  productId: string;
  name: string;
  recipe: Recipe | undefined;
  ingredients: Ingredient[];
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { saveRecipe } = useInventoryActions();
  const form = useForm<RecipeFormInput, unknown, RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    defaultValues: {
      productId,
      yieldQuantity: String(recipe?.yieldQuantity ?? 1),
      ingredients: recipe?.ingredients.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: String(line.quantity),
      })) ?? [{ ingredientId: "", quantity: "" }],
    },
  });
  useEffect(() => {
    onDirtyChange(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);
  const lines = useFieldArray({ control: form.control, name: "ingredients" });
  const values = useWatch({ control: form.control });
  const valid = recipeFormSchema.safeParse(values);
  const estimate = valid.success
    ? valid.data.ingredients.reduce(
        (sum, line) =>
          sum +
          line.quantity *
            (ingredients.find((item) => item.id === line.ingredientId)
              ?.costPerUnit ?? 0),
        0,
      )
    : null;
  async function save(data: RecipeFormValues) {
    try {
      const result = await saveRecipe.mutateAsync({
        productId,
        payload: {
          yieldQuantity: data.yieldQuantity,
          ingredients: data.ingredients,
          isActive: true,
        },
      });
      form.reset({
        productId,
        yieldQuantity: String(result.yieldQuantity),
        ingredients: result.ingredients.map((line) => ({
          ingredientId: line.ingredientId,
          quantity: String(line.quantity),
        })),
      });
    } catch {
      /* Render the server error and retain the draft. */
    }
  }
  function back() {
    if (
      !form.formState.isDirty ||
      window.confirm("Изменения рецептуры не сохранены. Выйти без сохранения?")
    )
      onBack();
  }
  return (
    <form
      className="recipe-editor inventory-form"
      data-testid="inventory-recipe-form"
      onSubmit={form.handleSubmit(save)}
      noValidate
    >
      <fieldset disabled={saveRecipe.isPending}>
        <button
          type="button"
          className="text-button recipe-back"
          data-testid="inventory-recipe-back"
          onClick={back}
        >
          ← Все блюда
        </button>
        <div className="recipe-editor-title">
          <div>
            <span className="inventory-kicker">СОСТАВ БЛЮДА</span>
            <h3>{name}</h3>
          </div>
          <span className="inventory-badge">
            {form.formState.isDirty
              ? "Есть изменения"
              : recipe?.isActive
                ? "Настроено"
                : "Новая рецептура"}
          </span>
        </div>
        <label className="recipe-yield">
          Этого рецепта хватает на
          <div className="inventory-input-unit">
            <input
              inputMode="decimal"
              data-testid="inventory-recipe-yield"
              {...form.register("yieldQuantity")}
            />
            <span>порций</span>
          </div>
          <FormFieldError
            message={form.formState.errors.yieldQuantity?.message}
          />
        </label>
        <div className="recipe-lines-head">
          <h4>Ингредиенты на весь рецепт</h4>
          <p>Например: 200 г риса на 2 порции = 100 г на одну.</p>
        </div>
        <div className="recipe-lines">
          {lines.fields.map((line, index) => {
            const ingredientId = values.ingredients?.[index]?.ingredientId;
            const ingredient = ingredients.find(
              (item) => item.id === ingredientId,
            );
            return (
              <div className="recipe-line" key={line.id}>
                <label>
                  <span>Ингредиент</span>
                  <select
                    data-testid={`inventory-recipe-ingredient-${line.id}`}
                    {...form.register(`ingredients.${index}.ingredientId`)}
                  >
                    <option value="">Выберите…</option>
                    {ingredients
                      .filter(
                        (item) => item.isActive || item.id === ingredientId,
                      )
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                          {item.isActive ? "" : " — выключен"}
                        </option>
                      ))}
                  </select>
                  <FormFieldError
                    message={
                      form.formState.errors.ingredients?.[index]?.ingredientId
                        ?.message
                    }
                  />
                </label>
                <label>
                  <span>
                    Количество
                    {ingredient
                      ? `, ${inventoryUnitLabels[ingredient.unit]}`
                      : ""}
                  </span>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    data-testid={`inventory-recipe-quantity-${line.id}`}
                    {...form.register(`ingredients.${index}.quantity`)}
                  />
                  <FormFieldError
                    message={
                      form.formState.errors.ingredients?.[index]?.quantity
                        ?.message
                    }
                  />
                </label>
                <button
                  type="button"
                  className="inventory-icon-button"
                  aria-label={`Удалить ${ingredient?.name ?? "строку"}`}
                  data-testid={`inventory-recipe-remove-${line.id}`}
                  onClick={() => lines.remove(index)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <FormFieldError
          message={
            form.formState.errors.ingredients?.message ??
            form.formState.errors.ingredients?.root?.message
          }
        />
        <button
          type="button"
          className="text-button"
          data-testid="inventory-recipe-add-line"
          disabled={lines.fields.length >= 100}
          onClick={() => lines.append({ ingredientId: "", quantity: "" })}
        >
          + Добавить ингредиент
        </button>
        <div className="recipe-cost" data-testid="inventory-recipe-cost">
          <div>
            <span>Себестоимость порции</span>
            <strong>
              {estimate !== null && valid.success
                ? (estimate / valid.data.yieldQuantity).toFixed(2)
                : "—"}{" "}
              <small>TMT</small>
            </strong>
          </div>
          <div>
            <span>Весь рецепт</span>
            <b>{estimate !== null ? estimate.toFixed(2) : "—"} TMT</b>
          </div>
          <p>
            {estimate === null
              ? "Укажите состав и количество порций для расчёта."
              : "По текущим закупочным ценам ингредиентов, без доставки и наценки."}
          </p>
        </div>
        <p className="inventory-hint">
          После сохранения ингредиенты будут списываться при заказе. Один рецепт
          действует для всех вариантов блюда.
        </p>
        {saveRecipe.error && (
          <p className="error-text" role="alert">
            {saveRecipe.error.message}
          </p>
        )}
        {saveRecipe.data && !form.formState.isDirty && (
          <p className="inventory-notice" role="status">
            Рецептура сохранена. Себестоимость порции:{" "}
            {(
              saveRecipe.data.estimatedCost / saveRecipe.data.yieldQuantity
            ).toFixed(2)}{" "}
            TMT.
          </p>
        )}
        <button
          type="submit"
          className="primary-button recipe-save"
          data-testid="inventory-recipe-save"
        >
          {saveRecipe.isPending ? "Сохраняем…" : "Сохранить рецептуру"}
        </button>
      </fieldset>
    </form>
  );
}
export function RecipeInventoryConfigurator({
  onAddIngredient,
  onDirtyChange,
}: {
  onAddIngredient: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const products = useAdminProducts();
  const ingredients = useInventoryIngredients();
  const recipes = useInventoryRecipes();
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [selected, setSelected] = useState<string | null>(null);
  const loading =
    products.isPending || ingredients.isPending || recipes.isPending;
  const error = products.error ?? ingredients.error ?? recipes.error;
  const selectedProduct = products.data?.find((item) => item.id === selected);
  const available = products.data?.filter(
    (item) =>
      item.isActive &&
      item.name
        .toLocaleLowerCase("ru")
        .includes(search.trim().toLocaleLowerCase("ru")),
  );
  const configured = recipes.data?.filter((item) => item.isActive).length ?? 0;
  return (
    <section data-testid="recipe-inventory-configurator">
      <div className="inventory-view-head">
        <div>
          <h2>Рецептуры блюд</h2>
          <p>Состав, расход ингредиентов и себестоимость одной порции.</p>
        </div>
        <span className="inventory-counter">{configured} настроено</span>
      </div>
      {loading ? (
        <div className="inventory-skeleton" role="status">
          Загружаем рецептуры…
        </div>
      ) : error ? (
        <div className="inventory-empty" role="alert">
          <p>{error.message}</p>
          <button
            className="secondary-button"
            data-testid="inventory-config-retry"
            onClick={() => {
              void products.refetch();
              void ingredients.refetch();
              void recipes.refetch();
            }}
          >
            Повторить
          </button>
        </div>
      ) : !ingredients.data?.some((item) => item.isActive) ? (
        <div className="inventory-empty">
          <span className="inventory-kicker">СНАЧАЛА ИНГРЕДИЕНТЫ</span>
          <h3>Из чего готовит кухня?</h3>
          <p>
            Добавьте ингредиенты и закупочные цены. Затем свяжите их с блюдами.
          </p>
          <button
            className="primary-button"
            data-testid="inventory-recipe-create-ingredient"
            onClick={onAddIngredient}
          >
            Добавить ингредиент
          </button>
        </div>
      ) : (
        <div
          className={`recipe-layout ${selected ? "recipe-layout-selected" : ""}`}
        >
          <aside className="recipe-products">
            <label className="inventory-search">
              <span className="sr-only">Найти блюдо</span>
              <input
                type="search"
                placeholder="Найти блюдо…"
                data-testid="inventory-recipe-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="recipe-product-list">
              {available?.map((product) => {
                const recipe = recipes.data?.find(
                  (item) => item.productId === product.id && item.isActive,
                );
                return (
                  <button
                    type="button"
                    key={product.id}
                    className={`recipe-product ${selected === product.id ? "selected" : ""}`}
                    data-testid={`inventory-recipe-product-${product.id}`}
                    onClick={() => {
                      if (selected === product.id) return;
                      if (
                        dirty &&
                        !window.confirm(
                          "Изменения рецептуры не сохранены. Перейти к другому блюду?",
                        )
                      )
                        return;
                      setDirty(false);
                      setSelected(product.id);
                    }}
                  >
                    <strong>{product.name}</strong>
                    <span>
                      {recipe
                        ? `${(recipe.estimatedCost / recipe.yieldQuantity).toFixed(2)} TMT / порция`
                        : "Нужно настроить"}
                    </span>
                    <i aria-hidden="true">{recipe ? "✓" : "+"}</i>
                  </button>
                );
              })}
              {!available?.length && (
                <p className="inventory-hint">
                  {search
                    ? "Блюда не найдены."
                    : "Сначала добавьте блюда в меню."}
                </p>
              )}
            </div>
          </aside>
          {selectedProduct ? (
            <RecipeEditor
              key={selectedProduct.id}
              productId={selectedProduct.id}
              name={selectedProduct.name}
              recipe={recipes.data?.find(
                (item) => item.productId === selectedProduct.id,
              )}
              ingredients={ingredients.data ?? []}
              onDirtyChange={setDirty}
              onBack={() => {
                setDirty(false);
                setSelected(null);
              }}
            />
          ) : (
            <div className="recipe-placeholder">
              <span aria-hidden="true">≡</span>
              <h3>Выберите блюдо</h3>
              <p>
                Укажите состав и количество порций.
                <br />
                Себестоимость появится сразу.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
