import { useState } from "react";
import { orderItemLabel, type Order, type Role } from "@/src/entities/order";

type OrderPackingChecklistProps = {
  order: Order;
  role: Role;
  pending: boolean;
  onConfirm: (order: Order, checkedItemIds: string[], checkedGiftIds: string[]) => void;
};

function formatPackedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OrderPackingChecklist({
  order,
  role,
  pending,
  onConfirm,
}: OrderPackingChecklistProps) {
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(
    () => new Set(),
  );

  if (order.status !== "COOKING" && order.status !== "READY") return null;

  if (order.packingConfirmedAt) {
    return (
      <div
        className="order-packing-confirmed"
        data-testid={`order-packing-confirmed-${order.id}`}
      >
        <span aria-hidden="true">✓</span>
        <strong>Заказ собран</strong>
        <small>{formatPackedAt(order.packingConfirmedAt)}</small>
      </div>
    );
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(role)) {
    return (
      <p className="order-packing-waiting">
        Ожидает проверки и сборки администратором
      </p>
    );
  }

  const checkedCount = [...order.items, ...order.gifts].filter((item) => checkedItemIds.has(item.id)).length;
  const totalCount = order.items.length + order.gifts.length;
  const allChecked =
    order.items.length > 0 && checkedCount === totalCount;

  return (
    <fieldset
      className="order-packing-checklist"
      data-testid={`order-packing-checklist-${order.id}`}
      disabled={pending}
    >
      <legend>Соберите заказ</legend>
      <p className="order-packing-instructions">
        Когда еда готова, проверьте количество и отметьте каждую позицию. После
        подтверждения выберите курьера.
      </p>
      {order.items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            data-testid={`order-packing-item-${order.id}-${item.id}`}
            checked={checkedItemIds.has(item.id)}
            onChange={(event) => {
              setCheckedItemIds((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(item.id);
                else next.delete(item.id);
                return next;
              });
            }}
          />
          <span>
            <b>{item.quantity}×</b> {orderItemLabel(item)}
          </span>
        </label>
      ))}
      {order.gifts.map((gift) => (
        <label key={gift.id}>
          <input
            type="checkbox"
            data-testid={`order-packing-gift-${order.id}-${gift.id}`}
            checked={checkedItemIds.has(gift.id)}
            onChange={(event) => setCheckedItemIds((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(gift.id);
              else next.delete(gift.id);
              return next;
            })}
          />
          <span><b>{gift.quantity}×</b> Подарок: {gift.name} ({gift.totalPoints} баллов)</span>
        </label>
      ))}
      <p
        className="order-packing-progress"
        role="status"
        data-testid={`order-packing-progress-${order.id}`}
      >
        Проверено {checkedCount} из {totalCount}
      </p>
      <button
        type="button"
        className="primary-button compact"
        data-testid={`order-confirm-packing-${order.id}`}
        disabled={!allChecked || pending}
        onClick={() => onConfirm(
          order,
          order.items.filter((item) => checkedItemIds.has(item.id)).map((item) => item.id),
          order.gifts.filter((gift) => checkedItemIds.has(gift.id)).map((gift) => gift.id),
        )}
      >
        {pending ? "Сохраняем…" : "✓ Заказ готов — к передаче курьеру"}
      </button>
    </fieldset>
  );
}
