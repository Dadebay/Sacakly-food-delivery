import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  useAccountingOrder,
  useAccountingOrderAudit,
} from "@/src/entities/accounting";
import { roleLabels, statusLabels } from "@/src/entities/order";
import { AsyncPanel } from "@/src/shared/ui";
import {
  actionLabel,
  inspectionMoney,
  inspectionTime,
  personName,
} from "../model/inspection";
import { InspectionAuditList } from "./inspection-audit";

export function InspectionOrderDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"detail" | "history">("detail");
  const [page, setPage] = useState(1);
  const detail = useAccountingOrder(id);
  const history = useAccountingOrderAudit(tab === "history" ? id : null, page);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => { element?.close(); requestAnimationFrame(() => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true }); }); };
  }, []);
  const order = detail.data;
  return createPortal(
    <dialog
      ref={dialog}
      className="inspection-drawer"
      data-testid="inspection-order-detail"
      aria-labelledby="inspection-order-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="inspection-drawer-header">
        <div>
          <span className="inspection-eyebrow">Карточка заказа</span>
          <h2 id="inspection-order-title">
            {order ? `Заказ №${order.number}` : "Загрузка заказа…"}
          </h2>
        </div>
        <button
          autoFocus
          type="button"
          className="secondary-button"
          data-testid="inspection-order-close"
          onClick={onClose}
          aria-label="Закрыть заказ"
        >
          Закрыть ✕
        </button>
      </header>
      <div className="inspection-detail-tabs">
        <button
          type="button"
          aria-pressed={tab === "detail"}
          data-testid="inspection-detail-tab"
          onClick={() => setTab("detail")}
        >
          Заказ и участники
        </button>
        <button
          type="button"
          aria-pressed={tab === "history"}
          data-testid="inspection-history-tab"
          onClick={() => setTab("history")}
        >
          История действий
        </button>
      </div>
      <div className="inspection-drawer-content">
        <AsyncPanel
          pending={detail.isPending}
          error={detail.error}
          onRetry={() => void detail.refetch()}
        >
          {order && tab === "detail" && (
            <>
              <div className="inspection-detail-status">
                <span
                  className={`inspection-status status-${order.status.toLowerCase()}`}
                >
                  {statusLabels[order.status]}
                </span>
                <span>{inspectionTime(order.createdAt)}</span>
                <span>
                  {order.source === "STAFF_PHONE"
                    ? "По телефону"
                    : "Из приложения"}
                </span>
              </div>
              {order.cancellationReason && (
                <div className="inspection-notice">
                  <strong>Причина отмены</strong>
                  <p>{order.cancellationReason}</p>
                </div>
              )}
              <section className="inspection-detail-section">
                <h3>Кто участвовал</h3>
                <div
                  className="inspection-people"
                  data-testid="inspection-participants"
                >
                  <article>
                    <span>Курьер заказа</span>
                    <strong>
                      {order.courier
                        ? personName(order.courier)
                        : "Не назначен"}
                    </strong>
                    <small>
                      {order.actualCourierUnknown
                        ? "Назначен технически. Кто доставил фактически — неизвестно."
                        : order.deliveredAt
                          ? `Доставка отмечена ${inspectionTime(order.deliveredAt)}`
                          : ["DELIVERED","CASH_RETURNED","RECONCILED"].includes(order.status) ? "Время доставки не сохранено" : "Доставка ещё не отмечена"}
                    </small>
                  </article>
                  <article>
                    <span>Повар</span>
                    <strong>
                      {order.cook
                        ? personName(order.cook)
                        : "В заказе не указан"}
                    </strong>
                    <small>{order.branchName ?? "Кухня не указана"}</small>
                  </article>
                  {order.participants?.map((person) => (
                    <article key={person.actor.id}>
                      <span>{roleLabels[person.actor.role]}</span>
                      <strong>{personName(person.actor)}</strong>
                      <small>
                        {[
                          ...new Set(
                            person.actions.map((action) =>
                              action.startsWith("transition:")
                                ? `Отметил: ${statusLabels[action.slice(11) as keyof typeof statusLabels] ?? "изменение статуса"}`
                                : actionLabel(action),
                            ),
                          ),
                        ].join(" · ")}
                      </small>
                    </article>
                  ))}
                </div>
              </section>
              <section className="inspection-detail-section">
                <h3>Клиент и доставка</h3>
                <div className="inspection-address-card">
                  <strong>
                    {order.customerName || "Имя клиента не заполнено"}
                  </strong>
                  <a href={`tel:${order.customerPhone}`}>
                    {order.customerPhone}
                  </a>
                  <p>{order.address}</p>
                  <span>{order.deliveryEtrapName ?? "Район не указан"}</span>
                  <p>
                    {[
                      order.entrance && `Подъезд ${order.entrance}`,
                      order.floor && `Этаж ${order.floor}`,
                      order.apartment && `Квартира ${order.apartment}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {order.customerNote && (
                    <p>
                      <strong>Пожелание клиента:</strong> {order.customerNote}
                    </p>
                  )}
                </div>
              </section>
              <section className="inspection-detail-section">
                <h3>
                  Состав заказа <small>{order.items.length} поз.</small>
                </h3>
                <ul className="inspection-item-list">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.productName}</strong>
                        {item.variantName && <span>{item.variantName}</span>}
                        <small>
                          {item.quantity} × {inspectionMoney(item.unitPrice)} ·
                          готовка {item.preparationMinutes} мин.
                        </small>
                      </div>
                      <b>{inspectionMoney(item.lineTotal)}</b>
                    </li>
                  ))}
                </ul>
                {!!order.gifts?.length && (
                  <>
                    <h4>Подарки</h4>
                    <ul className="inspection-item-list">
                      {order.gifts.map((gift) => (
                        <li key={gift.id}>
                          {gift.name} × {gift.quantity}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <dl className="inspection-totals">
                  <div>
                    <dt>Еда до скидки</dt>
                    <dd>{inspectionMoney(order.subtotal)}</dd>
                  </div>
                  <div>
                    <dt>Скидка</dt>
                    <dd>−{inspectionMoney(order.discount)}</dd>
                  </div>
                  <div className="inspection-food-total">
                    <dt>За еду</dt>
                    <dd>{inspectionMoney(order.foodAmount)}</dd>
                  </div>
                  <div>
                    <dt>Доставка отдельно</dt>
                    <dd>{inspectionMoney(order.deliveryFee)}</dd>
                  </div>
                  <div>
                    <dt>Всего с клиента</dt>
                    <dd>{inspectionMoney(order.total)}</dd>
                  </div>
                </dl>
              </section>
              <section
                className="inspection-detail-section"
                data-testid="inspection-cash-detail"
              >
                <h3>Деньги по заказу</h3>
                {order.settlement ? (
                  <>
                    <div className="inspection-notice">
                      <strong>
                        {order.settlement.status === "RECONCILED"
                          ? "Деньги сверены"
                          : order.settlement.status === "CONFIRMED"
                            ? "Деньги возвращены"
                            : "Возврат денег записан"}{" "}
                        · {inspectionMoney(order.settlement.amount)}
                      </strong>
                      {!order.settlement.operatorTakenAt &&
                        order.settlement.status === "RECONCILED" && (
                          <p>
                            Сдано ранее. Точная дата приёма денег не сохранена.
                          </p>
                        )}
                    </div>
                    <dl className="inspection-totals">
                      <div>
                        <dt>Принял деньги</dt>
                        <dd>{personName(order.settlement.operator)}</dd>
                      </div>
                      <div>
                        <dt>Сверил</dt>
                        <dd>{personName(order.settlement.accountant)}</dd>
                      </div>
                      {order.settlement.operatorTakenAt && (
                        <div>
                          <dt>Приём денег</dt>
                          <dd>
                            {inspectionTime(order.settlement.operatorTakenAt)}
                          </dd>
                        </div>
                      )}
                      {order.settlement.reconciledAt && (
                        <div>
                          <dt>Отметка о сверке</dt>
                          <dd>
                            {inspectionTime(order.settlement.reconciledAt)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </>
                ) : (
                  <p className="muted-text">Возврат денег ещё не записан.</p>
                )}
              </section>
              <button
                type="button"
                className="primary-button"
                data-testid="inspection-view-history"
                onClick={() => setTab("history")}
              >
                Кто и что менял в заказе →
              </button>
            </>
          )}
          {order && tab === "history" && (
            <>
              <section className="inspection-detail-section">
                <h3>Этапы заказа</h3>
                {!order.transitions.length && (
                  <p className="muted-text">Изменений статуса ещё нет.</p>
                )}
                <ol className="inspection-timeline">
                  {order.transitions.map((event) => (
                    <li key={event.id}>
                      <strong>
                        {statusLabels[event.fromStatus]} →{" "}
                        {statusLabels[event.toStatus]}
                      </strong>
                      <span>
                        {personName(event.actor)} ·{" "}
                        {inspectionTime(event.createdAt)}
                      </span>
                      {event.note && <p>{event.note}</p>}
                    </li>
                  ))}
                </ol>
              </section>
              <section className="inspection-detail-section">
                <h3>Все действия и изменения</h3>
                <AsyncPanel
                  pending={history.isPending}
                  error={history.error}
                  onRetry={() => void history.refetch()}
                >
                  {history.data && (
                    <InspectionAuditList data={history.data} onPage={setPage} />
                  )}
                </AsyncPanel>
              </section>
            </>
          )}
        </AsyncPanel>
      </div>
    </dialog>,
    document.body,
  );
}
