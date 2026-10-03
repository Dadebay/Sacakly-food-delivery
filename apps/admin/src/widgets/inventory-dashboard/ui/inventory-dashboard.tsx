import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useBranches } from "@/src/entities/branch";
import {
  inventoryStatusLabels,
  inventorySummary,
  thresholdCoverage,
  useInventoryStock,
  type StockItem,
} from "@/src/entities/inventory";
import { inventoryPurchaseUnits } from "@/src/features/inventory-management";
import { StockAdjustment } from "./stock-adjustment";
import "./inventory-dashboard.css";

const statusOrder: StockItem["status"][] = [
  "OUT_OF_STOCK",
  "LOW_STOCK",
  "IN_STOCK",
];
function quantity(value: number, unit: StockItem["unit"]) {
  const purchase = inventoryPurchaseUnits[unit];
  return `${(value / purchase.factor).toLocaleString("ru-RU", { maximumFractionDigits: 6 })} ${purchase.label}`;
}
export function InventoryDashboard({
  onAddIngredient,
  onOpenRecipes,
}: {
  onAddIngredient: () => void;
  onOpenRecipes: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const branchId = params.get("branchId") || undefined;
  const status = params.get("stockStatus") ?? "all";
  const [search, setSearch] = useState("");
  const stock = useInventoryStock(branchId);
  const branches = useBranches();
  const [editing, setEditing] = useState<{
    item: StockItem;
    type: "RECEIPT" | "WASTE";
  } | null>(null);
  const [saved, setSaved] = useState("");
  const counts = inventorySummary(stock.data ?? []);
  const visible = useMemo(
    () =>
      (stock.data ?? [])
        .filter(
          (item) =>
            (status === "all" || item.status === status) &&
            item.ingredientName
              .toLocaleLowerCase("ru")
              .includes(search.trim().toLocaleLowerCase("ru")),
        )
        .sort(
          (a, b) =>
            statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) ||
            a.ingredientName.localeCompare(b.ingredientName, "ru"),
        ),
    [stock.data, status, search],
  );
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  }
  return (
    <section data-testid="inventory-dashboard" className="stock-overview">
      <div className="inventory-view-head">
        <div>
          <h2>Что есть на кухне</h2>
          <p>Сначала показаны позиции, которые нужно пополнить.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          data-testid="inventory-add-ingredient"
          onClick={onAddIngredient}
        >
          + Ингредиент
        </button>
      </div>
      <div className="inventory-filters">
        <label className="inventory-search">
          <span className="sr-only">Найти ингредиент</span>
          <input
            type="search"
            placeholder="Найти ингредиент…"
            value={search}
            data-testid="inventory-stock-search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          <span>Филиал</span>
          <select
            value={branchId ?? ""}
            data-testid="inventory-branch-filter"
            onChange={(e) => filter("branchId", e.target.value)}
          >
            <option value="">Все филиалы</option>
            {branches.data?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {branches.error && (
        <p role="alert" className="error-text">
          Не удалось загрузить филиалы.{" "}
          <button
            className="text-button"
            data-testid="inventory-branches-retry"
            onClick={() => void branches.refetch()}
          >
            Повторить
          </button>
        </p>
      )}
      {saved && (
        <p role="status" className="inventory-notice">
          {saved}
        </p>
      )}
      {stock.isPending ? (
        <div className="inventory-skeleton" role="status">
          Загружаем остатки…
        </div>
      ) : stock.error ? (
        <div className="inventory-empty" role="alert">
          <h3>Не удалось загрузить склад</h3>
          <p>{stock.error.message}</p>
          <button
            className="secondary-button"
            data-testid="inventory-stock-retry"
            onClick={() => void stock.refetch()}
          >
            Повторить
          </button>
        </div>
      ) : !stock.data?.length ? (
        <div
          className="inventory-onboarding"
          data-testid="inventory-stock-empty"
        >
          <span className="inventory-kicker">НАЧНЁМ С ПРОСТОГО</span>
          <h2>Настройте склад в три шага</h2>
          <p>Добавьте продукты, укажите остатки и свяжите их с блюдами.</p>
          <ol>
            <li>
              <b>1</b>
              <div>
                <h3>Добавьте ингредиенты</h3>
                <p>Например, рис: цена за кг и минимальный запас.</p>
                <button
                  className="primary-button"
                  data-testid="inventory-setup-ingredient"
                  onClick={onAddIngredient}
                >
                  Добавить первый ингредиент
                </button>
              </div>
            </li>
            <li>
              <b>2</b>
              <div>
                <h3>Запишите начальный остаток</h3>
                <p>Выберите филиал и нажмите «Приход» возле ингредиента.</p>
              </div>
            </li>
            <li>
              <b>3</b>
              <div>
                <h3>Составьте рецептуры</h3>
                <p>Укажите расход на порцию — заказы начнут уменьшать склад.</p>
                <button
                  className="text-button"
                  data-testid="inventory-setup-recipes"
                  onClick={onOpenRecipes}
                >
                  Перейти к рецептурам →
                </button>
              </div>
            </li>
          </ol>
        </div>
      ) : (
        <>
          <div className="stock-summary" aria-label="Состояние запасов">
            {statusOrder.map((key) => (
              <button
                type="button"
                className={`stock-stat stock-stat-${key}`}
                key={key}
                data-testid={`inventory-status-${key}`}
                aria-pressed={status === key}
                onClick={() =>
                  filter("stockStatus", status === key ? "all" : key)
                }
              >
                <span className="stock-stat-label">
                  <i />
                  {inventoryStatusLabels[key]}
                </span>
                <strong>{counts[key]}</strong>
                <span>позиций</span>
              </button>
            ))}
          </div>
          <div className="stock-list-head">
            <p>
              <strong>{visible.length}</strong> позиций{" "}
              {status !== "all" && (
                <button
                  className="text-button"
                  data-testid="inventory-status-all"
                  onClick={() => filter("stockStatus", "all")}
                >
                  Сбросить фильтр ×
                </button>
              )}
            </p>
            <span className="inventory-live">
              <i /> Обновление каждые 15 сек.
            </span>
          </div>
          {visible.length === 0 ? (
            <div className="inventory-empty">
              <h3>Ничего не найдено</h3>
              <p>Измените название или фильтр наличия.</p>
            </div>
          ) : (
            <div className="stock-list">
              {visible.map((item) => {
                const key = `${item.branchId}:${item.ingredientId}`;
                const coverage = thresholdCoverage(item);
                return (
                  <article
                    className="stock-row"
                    key={key}
                    data-testid={`inventory-stock-row-${key}`}
                  >
                    <div className="stock-name">
                      <strong>{item.ingredientName}</strong>
                      <span>{item.branchName}</span>
                    </div>
                    <div className="stock-amount">
                      <strong>{quantity(item.quantity, item.unit)}</strong>
                      <span
                        className={`inventory-badge inventory-badge-${item.status}`}
                      >
                        {inventoryStatusLabels[item.status]}
                      </span>
                    </div>
                    <div className="stock-threshold">
                      <span>
                        Минимум: {quantity(item.reorderPoint, item.unit)}
                      </span>
                      {coverage !== null ? (
                        <div
                          className={`stock-meter stock-meter-${item.status}`}
                          role="meter"
                          aria-label={`Запас ${item.ingredientName} относительно минимума`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.max(0, coverage)}
                        >
                          <i style={{ width: `${Math.max(0, coverage)}%` }} />
                        </div>
                      ) : (
                        <small>Порог не задан</small>
                      )}
                    </div>
                    <div className="stock-actions">
                      <button
                        type="button"
                        className="stock-receive"
                        data-testid={`inventory-receive-${key}`}
                        onClick={() => {
                          setSaved("");
                          setEditing({ item, type: "RECEIPT" });
                        }}
                      >
                        + Приход
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        data-testid={`inventory-writeoff-${key}`}
                        onClick={() => {
                          setSaved("");
                          setEditing({ item, type: "WASTE" });
                        }}
                      >
                        Списать
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {editing && (
        <StockAdjustment
          item={editing.item}
          initialType={editing.type}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setSaved(
              `Операция сохранена: ${editing.item.ingredientName}. Остатки обновлены.`,
            );
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
