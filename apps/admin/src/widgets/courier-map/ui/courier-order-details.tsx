import type { DispatchCourier } from "@/src/entities/courier";
import { orderItemLabel } from "@/src/entities/order";

export function CourierOrderDetails({ courier }: { courier: DispatchCourier }) {
  return (
    <div
      className="dispatch-order-details"
      data-testid={`dispatch-courier-details-${courier.id}`}
    >
      <a
        className="dispatch-courier-phone"
        href={`tel:${courier.phone}`}
        data-testid={`dispatch-call-courier-${courier.id}`}
      >
        Позвонить курьеру · {courier.phone}
      </a>
      {!courier.location && (
        <p className="dispatch-detail-notice">
          Нет GPS — положение курьера пока неизвестно.
        </p>
      )}
      {courier.activeOrders.length === 0 ? (
        <p className="dispatch-detail-notice">
          Нет активных заказов. Курьер свободен.
        </p>
      ) : (
        courier.activeOrders.map((order) => (
          <article
            className="dispatch-order"
            key={order.id}
            data-testid={`dispatch-order-${order.id}`}
          >
            <header>
              <strong>Заказ #{order.number}</strong>
              <b>{order.cashToCollect} TMT</b>
            </header>
            <span className="dispatch-order-stage">
              {order.status === "OUT_FOR_DELIVERY"
                ? "В пути к клиенту"
                : "Забирает заказ"}
            </span>
            {order.branch && (
              <p>
                <small>
                  {order.status === "OUT_FOR_DELIVERY"
                    ? "Заказ из филиала"
                    : "Забрать из филиала"}
                </small>
                {order.branch.name}
                {order.branch.address && ` · ${order.branch.address}`}
              </p>
            )}
            <p>
              <small>Куда доставить</small>
              {order.address}
            </p>
            {(order.entrance || order.floor || order.apartment) && (
              <p className="dispatch-address-extra">
                {[
                  order.entrance && `Подъезд ${order.entrance}`,
                  order.floor && `Этаж ${order.floor}`,
                  order.apartment && `Кв. ${order.apartment}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <a
              href={`tel:${order.customer.phone}`}
              data-testid={`dispatch-call-customer-${order.id}`}
            >
              {[order.customer.firstName, order.customer.lastName]
                .filter(Boolean)
                .join(" ") || "Клиент"}{" "}
              · {order.customer.phone}
            </a>
            <div className="dispatch-order-meals">
              <small>Что в заказе</small>
              <ul>
                {order.items.map((item) => (
                  <li key={`${item.productName}:${item.variantName ?? "base"}`}>
                    <span>{orderItemLabel(item)}</span>
                    <b>× {item.quantity}</b>
                  </li>
                ))}
              </ul>
            </div>
            <p
              className={
                order.customerNote
                  ? "dispatch-order-comment"
                  : "dispatch-no-comment"
              }
              data-testid={`dispatch-comment-${order.id}`}
            >
              <small>Комментарий клиента</small>
              {order.customerNote || "Без комментария"}
            </p>
          </article>
        ))
      )}
    </div>
  );
}
