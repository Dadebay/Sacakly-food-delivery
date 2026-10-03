import { lazy, Suspense, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { InventoryDashboard } from "@/src/widgets/inventory-dashboard";
import "./meal-config-calculator.css";

const Ingredients = lazy(() =>
  import("./ingredient-manager").then((module) => ({
    default: module.IngredientManager,
  })),
);
const Recipes = lazy(() =>
  import("./recipe-inventory-configurator").then((module) => ({
    default: module.RecipeInventoryConfigurator,
  })),
);
const Flow = lazy(() => import("./inventory-flow").then((module) => ({ default: module.InventoryFlow })));
const sections = [
  { id: "stock", label: "Остатки", number: "01" },
  { id: "ingredients", label: "Ингредиенты", number: "02" },
  { id: "recipes", label: "Рецептуры", number: "03" },
  { id: "flow", label: "Партии и цех", number: "04" },
] as const;
type Section = (typeof sections)[number]["id"];

export function MealConfigCalculator() {
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [params, setParams] = useSearchParams();
  const section =
    sections.find((item) => item.id === params.get("view"))?.id ?? "stock";
  function navigate(next: Section, create = false) {
    if (
      next !== section &&
      recipeDirty &&
      !window.confirm(
        "Рецептура не сохранена. Перейти в другой раздел без сохранения?",
      )
    )
      return;
    if (next !== section) setRecipeDirty(false);
    const updated = new URLSearchParams(params);
    updated.set("view", next);
    updated.delete("productId");
    if (create) updated.set("new", "1");
    else updated.delete("new");
    setParams(updated);
  }
  if (params.get("view") === "budget") {
    return <Navigate to="/meal-config?view=stock" replace />;
  }
  return (
    <section
      className="admin-section inventory-workspace"
      data-testid="meal-config-calculator"
    >
      <header className="inventory-page-head">
        <div>
          <span className="inventory-kicker">УЧЁТ КУХНИ</span>
          <h1>Склад и рецептуры</h1>
          <p>Запасы, партии, передача в цех, состав блюд и фактические потери.</p>
        </div>
        <details className="inventory-help">
          <summary data-testid="inventory-help-toggle">
            Как работает учёт <span aria-hidden="true">?</span>
          </summary>
          <div>
            <strong>Резерв заказа и движение партии</strong>
            <ol>
              <li>Добавьте ингредиенты и их закупочные цены.</li>
              <li>Создайте место хранения и проведите приход партии или сверьте начальный остаток.</li>
              <li>Свяжите продаваемый товар со складской позицией либо укажите состав блюда.</li>
            </ol>
            <p>
              Новый заказ резервирует продукты. Передача курьеру фиксирует физическую выдачу.
              Отменённый до выдачи резерв возвращается; после выдачи товар не восстанавливается автоматически.
            </p>
          </div>
        </details>
      </header>
      <nav className="inventory-tabs" aria-label="Разделы учёта">
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={"inventory-tab-" + item.id}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <span>{item.number}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="inventory-tab-content" key={section}>
        <Suspense
          fallback={
            <div className="inventory-skeleton" role="status">
              Загружаем раздел…
            </div>
          }
        >
          {section === "stock" && (
            <InventoryDashboard
              onAddIngredient={() => navigate("ingredients", true)}
              onOpenRecipes={() => navigate("recipes")}
            />
          )}
          {section === "ingredients" && (
            <Ingredients onReceive={() => navigate("stock")} />
          )}
          {section === "recipes" && (
            <Recipes
              onDirtyChange={setRecipeDirty}
              onAddIngredient={() => navigate("ingredients", true)}
            />
          )}
          {section === "flow" && <Flow />}
        </Suspense>
      </div>
    </section>
  );
}
