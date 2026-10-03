import { useState } from "react";
import { Link } from "react-router";
import {
  formatInventoryQuantity,
  inventoryMovementLabels,
  useInventoryMovements,
} from "@/src/entities/inventory";
import { useSession } from "@/src/shared/auth";
import "./inventory-notifications.css";

function readSeen(key: string): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((id): id is string => typeof id === "string").slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function InventoryNotificationFeed({ userId }: { userId: string }) {
  const feed = useInventoryMovements();
  const key = `a7-inventory-seen:${userId}`;
  const [seen, setSeen] = useState(() => readSeen(key));
  const [open, setOpen] = useState(false);
  const unread = feed.data?.filter((item) => !seen.includes(item.id)) ?? [];
  function markRead() {
    const next = feed.data?.map((item) => item.id) ?? [];
    setSeen(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Reading still works when browser storage is unavailable. */
    }
  }
  return (
    <div
      className="inventory-notifications"
      data-testid="inventory-notifications"
    >
      <div className="inventory-notifications-trigger-row">
        <button
          type="button"
          className="secondary-button"
          aria-expanded={open}
          aria-controls="inventory-notifications-panel"
          data-testid="inventory-notifications-toggle"
          onClick={() => setOpen(!open)}
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
          Склад
          {feed.isError
            ? " · недоступен"
            : unread.length > 0
              ? ` · ${unread.length} новых`
              : ""}
        </button>
        {unread.length > 0 && !feed.isError && (
          <span
            className="inventory-notification-preview"
            role="status"
            data-testid="inventory-notification-preview"
          >
            {unread[0].ingredientName}:{" "}
            {formatInventoryQuantity(unread[0].quantityDelta, unread[0].unit)} ·{" "}
            {unread[0].branchName}
          </span>
        )}
      </div>
      {open && (
        <section
          className="inventory-notifications-panel"
          id="inventory-notifications-panel"
          data-testid="inventory-notifications-panel"
          aria-label="Уведомления склада"
        >
          <div className="inventory-notifications-heading">
            <div>
              <strong>Уменьшение запасов</strong>
              <p>
                Последние 20 операций по всем филиалам. Только внутри админки.
              </p>
            </div>
            <button
              type="button"
              className="text-button"
              data-testid="inventory-notifications-close"
              onClick={() => setOpen(false)}
            >
              Закрыть
            </button>
          </div>
          {feed.isPending ? (
            <p role="status">Загружаем уведомления…</p>
          ) : feed.isError ? (
            <p role="alert">
              Не удалось загрузить уведомления.{" "}
              <button
                className="text-button"
                type="button"
                data-testid="inventory-notifications-retry"
                onClick={() => void feed.refetch()}
              >
                Повторить
              </button>
            </p>
          ) : !feed.data?.length ? (
            <p>
              Расходов ещё нет. Уведомления появятся после списания
              ингредиентов.
            </p>
          ) : (
            <>
              <button
                className="text-button"
                type="button"
                disabled={!unread.length}
                data-testid="inventory-notifications-read"
                onClick={markRead}
              >
                Отметить просмотренными
              </button>
              <ul>
                {feed.data.map((movement) => (
                  <li
                    key={movement.id}
                    data-testid={`inventory-notification-${movement.id}`}
                    className={
                      seen.includes(movement.id)
                        ? ""
                        : "inventory-notification-unread"
                    }
                  >
                    <div>
                      <strong>
                        {movement.ingredientName} ·{" "}
                        {formatInventoryQuantity(
                          movement.quantityDelta,
                          movement.unit,
                        )}
                      </strong>
                      <small>
                        {movement.branchName} ·{" "}
                        {movement.orderNumber
                          ? `Заказ №${movement.orderNumber}`
                          : inventoryMovementLabels[movement.type]}
                      </small>
                      <span>
                        Остаток после операции:{" "}
                        {formatInventoryQuantity(
                          movement.quantityAfter,
                          movement.unit,
                        )}
                      </span>
                      {movement.reason && <small>{movement.reason}</small>}
                    </div>
                    <time dateTime={movement.createdAt}>
                      {new Date(movement.createdAt).toLocaleString("ru-RU", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link
            className="secondary-button link-button"
            data-testid="inventory-notifications-open-stock"
            to="/meal-config#inventory-stock"
            onClick={() => setOpen(false)}
          >
            Открыть склад
          </Link>
        </section>
      )}
    </div>
  );
}
export function InventoryNotifications() {
  const { session } = useSession();
  if (
    !session ||
    (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")
  )
    return null;
  return (
    <InventoryNotificationFeed key={session.user.id} userId={session.user.id} />
  );
}
