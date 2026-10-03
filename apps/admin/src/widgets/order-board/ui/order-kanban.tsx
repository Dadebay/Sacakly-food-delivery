import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  OrderPaymentBreakdown,
  canCancel,
  canAdministratorCompleteOrder,
  canEditCourierAssignment,
  canAdministratorEditOrder,
  kanbanLanesForRole,
  nextOrderStatus,
  orderTransitionActionLabel,
  previousOrderStatus,
  orderItemLabel,
  orderCardFieldsForRole,
  roleCanUseOrderTable,
  statusLabels,
  type Courier,
  type Order,
  type OrderKanbanLane,
  type OrderStatus,
  type Role,
} from "@/src/entities/order";
import { OrderPackingChecklist } from "./order-packing-checklist";

type OrderKanbanProps = {
  orders: Order[];
  role: Role;
  fixedStatus?: OrderStatus;
  couriers: Courier[];
  courierByOrder: Record<string, string>;
  pending: boolean;
  onCourierChange: (orderId: string, courierId: string) => void;
  onAssignCourier: (order: Order, courierId: string) => void;
  onConfirmPacking: (order: Order, checkedItemIds: string[], checkedGiftIds: string[]) => void;
  onTransition: (order: Order, status: OrderStatus, note?: string) => void;
  onPrintReceipt: (order: Order) => void;
  onCancel: (order: Order) => void;
  onComplete: (order: Order) => void;
  onEditOrder: (order: Order) => void;
  onOpenDetails: (orderId: string) => void;
};

type OrderCardProps = Omit<OrderKanbanProps, "orders" | "fixedStatus"> & {
  order: Order;
};

function personName(person: {
  firstName: string | null;
  lastName: string | null;
  phone?: string;
}) {
  return (
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.phone ||
    "Без имени"
  );
}

function formatOrderTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function deliveryMeta(order: Order) {
  return [
    order.entrance && `подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
    order.apartment && `кв. ${order.apartment}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function OrderCard({
  order,
  role,
  couriers,
  courierByOrder,
  pending,
  onCourierChange,
  onAssignCourier,
  onConfirmPacking,
  onTransition,
  onPrintReceipt,
  onCancel,
  onComplete,
  onEditOrder,
  onOpenDetails,
}: OrderCardProps) {
  const fields = orderCardFieldsForRole(role);
  const canOpenDetails = roleCanUseOrderTable(role);
  const next = nextOrderStatus(role, order.status);
  const previous = previousOrderStatus(role, order.status);
  const selectedCourier = courierByOrder[order.id] ?? "";
  const meta = deliveryMeta(order);
  const canAssign =
    order.status === "READY" &&
    Boolean(order.packingConfirmedAt) &&
    ["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role);
  const administratorIsPacking =
    ["COOKING", "READY"].includes(order.status) &&
    !order.packingConfirmedAt &&
    ["ADMIN", "SUPER_ADMIN"].includes(role);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <details
      className="order-kanban-card"
      data-testid={`order-kanban-card-${order.id}`}
      open={isExpanded}
      onToggle={(event) => setIsExpanded(event.currentTarget.open)}
    >
      <summary
        className="order-kanban-card-summary"
        data-testid={`order-kanban-summary-${order.id}`}
      >
        <span className="order-kanban-card-summary-main">
          <strong>#{order.number}</strong>
          <time dateTime={order.createdAt}>
            {formatOrderTime(order.createdAt)}
          </time>
        </span>
        <span className={`status-pill status-${order.status.toLowerCase()}`}>
          {statusLabels[order.status]}
        </span>
        <span className="order-kanban-card-summary-meta">
          {fields.has("customer") && <b>{personName(order.customer)}</b>}
          <small>
            {order.courier
              ? `Курьер: ${personName(order.courier)}`
              : (order.branchName ?? "Филиал не назначен")}
          </small>
        </span>
        {(administratorIsPacking || canAssign) && (
          <span
            className="order-kanban-workflow-hint"
            data-testid={`order-kanban-workflow-${order.id}`}
          >
            {administratorIsPacking
              ? "1. Проверить готовность и собрать"
              : "2. Назначить курьера"}
          </span>
        )}
      </summary>

      <div className="order-kanban-card-body">
        {order.customerNote && (role === "COOK" || fields.has("delivery")) && (
          <p
            className="order-kanban-note order-customer-comment"
            data-testid={`order-kanban-note-${order.id}`}
          >
            <strong>Комментарий к заказу:</strong> {order.customerNote}
          </p>
        )}
        {fields.has("items") && (
          <OrderPackingChecklist
            key={`${order.id}-${order.version}`}
            order={order}
            role={role}
            pending={pending}
            onConfirm={onConfirmPacking}
          />
        )}

        {canAssign && (
          <div
            className="order-kanban-handoff"
            data-testid={`order-kanban-handoff-${order.id}`}
          >
            <label className="order-kanban-courier">
              <span>Назначить курьера</span>
              <select
                data-testid={`order-kanban-courier-${order.id}`}
                aria-label={`Курьер для заказа ${order.number}`}
                value={selectedCourier}
                disabled={pending}
                onChange={(event) =>
                  onCourierChange(order.id, event.target.value)
                }
              >
                <option value="">Выберите курьера</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {personName(courier)} · {courier.courierOrders.length} в
                    работе
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary-button compact"
              data-testid={`order-kanban-assign-${order.id}`}
              disabled={!selectedCourier || pending}
              onClick={() => onAssignCourier(order, selectedCourier)}
            >
              Отдать курьеру
            </button>
          </div>
        )}

        {order.source === "STAFF_PHONE" && (
          <span className="order-source-label">Заказ по телефону</span>
        )}

        {fields.has("customer") && (
          <div className="order-kanban-person">
            <span>Клиент</span>
            <strong>{personName(order.customer)}</strong>
            <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
          </div>
        )}

        {fields.has("delivery") && (
          <div className="order-kanban-address">
            <span>Куда доставить</span>
            <strong>{order.address}</strong>
            {order.deliveryEtrapName && (
              <small>{order.deliveryEtrapName}</small>
            )}
            {meta && <small>{meta}</small>}
          </div>
        )}

        {fields.has("branch") && (
          <div className="order-kanban-meta">
            <span>Филиал</span>
            <strong>{order.branchName ?? "Старый заказ"}</strong>
          </div>
        )}

        {fields.has("items") && !administratorIsPacking && (
          <ul className="order-kanban-items" aria-label="Состав заказа">
            {order.items.map((item) => (
              <li key={item.id}>
                <b>{item.quantity}×</b>
                <span>{orderItemLabel(item)}</span>
              </li>
            ))}
            {order.gifts.map((gift) => <li key={gift.id}><b>{gift.quantity}×</b><span>Подарок: {gift.name}</span></li>)}
          </ul>
        )}

        {order.cancellationReason && canOpenDetails && (
          <p className="order-kanban-note">
            <strong>Причина отмены:</strong> {order.cancellationReason}
          </p>
        )}

        <div className="order-kanban-finance">
          {fields.has("cash") && (
            <OrderPaymentBreakdown
              order={order}
              testId={`order-kanban-payment-${order.id}`}
            />
          )}
          {fields.has("courier") && order.courier && (
            <div>
              <span>Курьер</span>
              <strong>{personName(order.courier)}</strong>
            </div>
          )}
        </div>

        <div className="order-kanban-actions">
          {canOpenDetails && (
            <button
              type="button"
              className="secondary-button compact"
              data-testid={`order-kanban-details-${order.id}`}
              onClick={() => onOpenDetails(order.id)}
            >
              Подробнее
            </button>
          )}
          {(canAdministratorEditOrder(role, order.status) ||
            canEditCourierAssignment(role, order.status)) && (
            <button
              type="button"
              className="secondary-button compact"
              data-testid={`order-kanban-edit-${order.id}`}
              disabled={pending}
              onClick={() => onEditOrder(order)}
            >
              Редактировать
            </button>
          )}
          {previous && (
            <button
              type="button"
              className="secondary-button compact"
              data-testid={`order-kanban-rollback-${order.id}`}
              disabled={pending}
              onClick={() => {
                const note = window.prompt(
                  "Причина возврата заказа на предыдущий этап",
                );
                if (note?.trim()) {
                  onTransition(order, previous, note.trim());
                }
              }}
            >
              Вернуть: {statusLabels[previous]}
            </button>
          )}
          {next && !(next === "CASH_RETURNED" && canAdministratorCompleteOrder(role, order.status)) && (
            <button
              type="button"
              className="primary-button compact"
              data-testid={`order-kanban-transition-${order.id}`}
              disabled={pending}
              onClick={() => onTransition(order, next)}
            >
              {orderTransitionActionLabel(role, next)}
            </button>
          )}
          {canAdministratorCompleteOrder(role, order.status) && (
            <button type="button" className="primary-button compact" data-testid={`order-kanban-complete-${order.id}`} disabled={pending} onClick={() => onComplete(order)}>
              Завершить заказ
            </button>
          )}
          {["OPERATOR", "ADMIN", "SUPER_ADMIN"].includes(role) && (
            <button
              type="button"
              className="secondary-button compact"
              data-testid={`order-kanban-print-${order.id}`}
              disabled={pending}
              onClick={() => onPrintReceipt(order)}
            >
              Печать
            </button>
          )}
          {canCancel(role, order.status) && (
            <button
              type="button"
              className="danger-button compact"
              data-testid={`order-kanban-cancel-${order.id}`}
              disabled={pending}
              onClick={() => onCancel(order)}
            >
              Отменить
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function VirtualizedOrderLane({
  lane,
  orders,
  archive = false,
  ...cardProps
}: Omit<OrderKanbanProps, "orders" | "fixedStatus"> & {
  lane: OrderKanbanLane;
  orders: Order[];
  archive?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const getItemKey = useCallback(
    (index: number) => orders[index]?.id ?? index,
    [orders],
  );
  // TanStack Virtual deliberately owns mutable scroll measurements; React
  // Compiler must leave this small lane component un-memoized.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 78,
    getItemKey,
    overscan: 3,
    useFlushSync: false,
  });

  return (
    <section
      className={`order-kanban-lane order-kanban-lane--${lane.id}`}
      data-testid={`order-kanban-column-${lane.id}`}
      aria-label={archive ? lane.title : undefined}
      aria-labelledby={archive ? undefined : `order-kanban-title-${lane.id}`}
    >
      {!archive && (
        <header className="order-kanban-lane-head">
          <div>
            <span>{lane.responsibility}</span>
            <h2 id={`order-kanban-title-${lane.id}`}>{lane.title}</h2>
          </div>
          <strong aria-label={`${orders.length} заказов`}>
            {orders.length}
          </strong>
        </header>
      )}

      <div
        ref={scrollRef}
        className={`order-kanban-scroll ${archive ? "is-archive" : ""}`}
        data-testid={`order-kanban-scroll-${lane.id}`}
      >
        {orders.length === 0 ? (
          <p className="order-kanban-empty">В этой колонке заказов нет</p>
        ) : (
          <div
            className="order-kanban-virtual-space"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const order = orders[virtualItem.index];
              if (!order) return null;
              return (
                <div
                  ref={virtualizer.measureElement}
                  className="order-kanban-virtual-row"
                  data-index={virtualItem.index}
                  key={virtualItem.key}
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <OrderCard order={order} {...cardProps} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function OrderKanban({
  orders,
  fixedStatus,
  ...props
}: OrderKanbanProps) {
  const lanes = useMemo(
    () =>
      kanbanLanesForRole(props.role).filter(
        (lane) => !fixedStatus || lane.statuses.includes(fixedStatus),
      ),
    [fixedStatus, props.role],
  );
  const activeLanes = lanes.filter((lane) => !lane.collapsed);
  const archiveLane = lanes.find((lane) => lane.collapsed);
  const ordersForLane = useCallback(
    (lane: OrderKanbanLane) =>
      orders.filter((order) => lane.statuses.includes(order.status)),
    [orders],
  );
  const archiveOrders = archiveLane ? ordersForLane(archiveLane) : [];

  return (
    <>
      <div
        className="order-kanban"
        data-testid="order-kanban"
        aria-label="Канбан-доска заказов"
      >
        {activeLanes.map((lane) => (
          <VirtualizedOrderLane
            key={lane.id}
            lane={lane}
            orders={ordersForLane(lane)}
            {...props}
          />
        ))}
      </div>

      {archiveLane && (
        <details
          className="order-kanban-archive"
          data-testid="order-kanban-archive"
        >
          <summary>
            <span>
              <strong>{archiveLane.title}</strong>
              <small>{archiveLane.responsibility}</small>
            </span>
            <b>{archiveOrders.length}</b>
          </summary>
          <VirtualizedOrderLane
            archive
            lane={archiveLane}
            orders={archiveOrders}
            {...props}
          />
        </details>
      )}
    </>
  );
}
