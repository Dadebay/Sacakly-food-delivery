import { useEffect } from "react";
import { formatBranchDistance } from "@/src/entities/branch";
import {
  OrderPaymentBreakdown,
  orderItemLabel,
  ratingStars,
  roleLabels,
  statusLabels,
  useOrder,
  type Order,
} from "@/src/entities/order";
import { AsyncPanel } from "@/src/shared/ui";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function staffName(
  person: Pick<Order["transitions"][number]["actor"], "firstName" | "lastName">,
) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function eventCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    last === 1 && lastTwo !== 11
      ? "событие"
      : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
        ? "события"
        : "событий";
  return `${count} ${word}`;
}

function deliveryDetails(order: Order) {
  return [
    order.entrance && `Подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
    order.apartment && `кв. ${order.apartment}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function RatingStars({ score }: { score: number }) {
  return (
    <span
      className="rating-stars"
      aria-label={`Оценка ${score} из 5`}
      title={`${score} из 5`}
    >
      <span aria-hidden="true">{ratingStars(score)}</span>
    </span>
  );
}

function OrderDetails({ order }: { order: Order }) {
  const initialStatus = order.transitions[0]?.fromStatus ?? order.status;
  return (
    <div className="order-detail-content">
      <div className="order-detail-summary">
        <article>
          <span>Статус</span>
          <strong>{statusLabels[order.status]}</strong>
        </article>
        <article data-testid={`order-detail-payment-${order.id}`}>
          <span>Оплата</span>
          <OrderPaymentBreakdown
            className="order-detail-payment-breakdown"
            order={order}
            testId={`order-detail-payment-breakdown-${order.id}`}
          />
          <small>Наличными</small>
        </article>
        <article>
          <span>Клиент</span>
          <strong>
            {[order.customer.firstName, order.customer.lastName]
              .filter(Boolean)
              .join(" ") || "Без имени"}
          </strong>
          <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
        </article>
        <article>
          <span>Адрес</span>
          <strong>{order.address}</strong>
          {order.deliveryEtrapName && (
            <small>
              {order.deliveryWelayatName
                ? `${order.deliveryWelayatName} · `
                : ""}
              {order.deliveryEtrapName}
            </small>
          )}
          {deliveryDetails(order) && <small>{deliveryDetails(order)}</small>}
        </article>
        <article>
          <span>Филиал</span>
          <strong>{order.branchName ?? "Не назначен"}</strong>
          {order.branchAddress && <small>{order.branchAddress}</small>}
          {order.branchDistanceMeters !== null && (
            <small>
              {formatBranchDistance(order.branchDistanceMeters)} до клиента
            </small>
          )}
        </article>
        <article>
          <span>Сборка</span>
          <strong>
            {order.packingConfirmedAt ? "Проверена ✓" : "Не подтверждена"}
          </strong>
          {order.packingConfirmedAt && (
            <small>{formatDate(order.packingConfirmedAt)}</small>
          )}
        </article>
      </div>

      <section className="order-detail-section" aria-labelledby="items-title">
        <div className="order-detail-section-head">
          <div>
            <span className="eyebrow">СОСТАВ ЗАКАЗА</span>
            <h3 id="items-title">{order.items.length} позиций</h3>
          </div>
          <OrderPaymentBreakdown
            className="order-detail-section-payment"
            order={order}
            testId={`order-detail-items-payment-${order.id}`}
          />
        </div>
        <ul className="order-detail-items">
          {order.items.map((item) => (
            <li key={item.id}>
              <span>{orderItemLabel(item)}</span>
              <strong>× {item.quantity}</strong>
            </li>
          ))}
          {order.gifts.map((gift) => (
            <li key={gift.id}>
              <span>Подарок: {gift.name} · {gift.totalPoints} баллов</span>
              <strong>× {gift.quantity}</strong>
            </li>
          ))}
        </ul>
        {order.customerNote && (
          <aside className="order-note" data-testid="order-detail-note">
            <strong>Комментарий к заказу</strong>
            <p>{order.customerNote}</p>
          </aside>
        )}
      </section>

      <section className="order-detail-section" aria-labelledby="review-title">
        <div className="order-detail-section-head">
          <div>
            <span className="eyebrow">ОТЗЫВ КЛИЕНТА</span>
            <h3 id="review-title">Оценка и комментарий</h3>
          </div>
          {order.rating && <RatingStars score={order.rating.score} />}
        </div>
        {order.rating ? (
          <div className="review-card">
            <div>
              <strong>{order.rating.score} из 5</strong>
              <time dateTime={order.rating.createdAt}>
                {formatDate(order.rating.createdAt)}
              </time>
            </div>
            <p>{order.rating.comment?.trim() || "Комментарий не оставлен"}</p>
          </div>
        ) : (
          <div className="empty-detail-state">
            Клиент пока не оставил оценку и комментарий.
          </div>
        )}
      </section>

      <section className="order-detail-section" aria-labelledby="history-title">
        <div className="order-detail-section-head">
          <div>
            <span className="eyebrow">ИСТОРИЯ ЗАКАЗА</span>
            <h3 id="history-title">Хронология статусов</h3>
          </div>
          <span className="history-count">
            {eventCountLabel(order.transitions.length + 1)}
          </span>
        </div>
        <ol className="order-timeline">
          <li>
            <i aria-hidden="true" />
            <div>
              <strong>Заказ создан</strong>
              <p>Начальный статус: {statusLabels[initialStatus]}</p>
              <time dateTime={order.createdAt}>
                {formatDate(order.createdAt)}
              </time>
            </div>
          </li>
          {order.transitions.map((transition) => {
            const actorName = staffName(transition.actor);
            return (
              <li key={transition.id}>
                <i aria-hidden="true" />
                <div>
                  <strong>
                    {statusLabels[transition.fromStatus]} →{" "}
                    {statusLabels[transition.toStatus]}
                  </strong>
                  <p>
                    {actorName || roleLabels[transition.actor.role]} ·{" "}
                    {roleLabels[transition.actor.role]}
                  </p>
                  {transition.note && (
                    <blockquote style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{transition.note}</blockquote>
                  )}
                  <time dateTime={transition.createdAt}>
                    {formatDate(transition.createdAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

export function OrderDetailDialog({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const order = useOrder(orderId);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop order-detail-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="modal order-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">ЗАКАЗ</span>
            <h2 id="order-detail-title">
              {order.data ? `#${order.data.number}` : "Загрузка…"}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Закрыть детали заказа"
            onClick={onClose}
            autoFocus
          >
            ×
          </button>
        </header>
        <AsyncPanel
          pending={order.isPending}
          error={order.error}
          onRetry={() => void order.refetch()}
        >
          {order.data && <OrderDetails order={order.data} />}
        </AsyncPanel>
      </section>
    </div>
  );
}
