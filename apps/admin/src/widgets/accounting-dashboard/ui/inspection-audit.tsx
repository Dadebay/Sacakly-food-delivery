import { useState } from "react";
import type { InspectionAuditPage } from "@/src/entities/accounting";
import { roleLabels, statusLabels } from "@/src/entities/order";
import {
  actionLabel,
  auditSummary,
  evidenceRecord,
  entityLabels,
  personName,
  auditChanges,
  auditFieldLabels,
  inspectionTime,
  inspectionMoney,
} from "../model/inspection";

export function EvidenceValue({
  value,
  names,
  field,
}: {
  value: unknown;
  names?: Record<string, string>;
  field?: string;
}) {
  if (value === null || value === undefined)
    return <span className="muted-text">Не указано</span>;
  if (typeof value === "boolean") return <span>{value ? "Да" : "Нет"}</span>;
  if (
    typeof value === "number" &&
    field &&
    /^(total|subtotal|amount|discount|deliveryFee|unitPrice|lineTotal|price|expectedAmount|declaredAmount)$/.test(
      field,
    )
  )
    return <span>{inspectionMoney(value)}</span>;
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((item) => typeof evidenceRecord(item).productName === "string")
  )
    return (
      <ul className="inspection-evidence-items">
        {value.map((item, index) => {
          const row = evidenceRecord(item);
          return (
            <li key={index}>
              <strong>{String(row.productName)}</strong>
              <span>
                {String(row.quantity ?? "—")} шт.
                {typeof row.unitPrice === "number"
                  ? ` × ${inspectionMoney(row.unitPrice)}`
                  : ""}
                {typeof row.lineTotal === "number"
                  ? ` = ${inspectionMoney(row.lineTotal)}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
    );
  if (Array.isArray(value))
    return value.length ? (
      <ol className="inspection-evidence-list">
        {value.map((item, index) => (
          <li key={index}>
            <EvidenceValue value={item} names={names} />
          </li>
        ))}
      </ol>
    ) : (
      <span>Пусто</span>
    );
  if (typeof value === "object")
    return (
      <dl className="inspection-evidence">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{auditFieldLabels[key] ?? key}</dt>
            <dd>
              <EvidenceValue value={item} names={names} field={key} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span>
      {typeof value === "string" && value in statusLabels
        ? statusLabels[value as keyof typeof statusLabels]
        : names && typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
          ? (names[value] ?? "Неизвестно (см. технические сведения)")
          : typeof value === "string" &&
              /^\d{4}-\d{2}-\d{2}T/.test(value) &&
              Number.isFinite(Date.parse(value))
            ? inspectionTime(value)
            : String(value)}
    </span>
  );
}

export function InspectionPagination({
  page,
  total,
  limit,
  onPage,
  prefix,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  prefix: string;
}) {
  return (
    <nav className="inspection-pagination" aria-label="Страницы результатов">
      <span>
        {total
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} из ${total}`
          : "Нет записей"}
      </span>
      <div>
        <button
          type="button"
          className="secondary-button"
          data-testid={`${prefix}-previous`}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Назад
        </button>
        <button
          type="button"
          className="secondary-button"
          data-testid={`${prefix}-next`}
          disabled={page * limit >= total}
          onClick={() => onPage(page + 1)}
        >
          Далее
        </button>
      </div>
    </nav>
  );
}

export function InspectionAuditList({
  data,
  onPage,
  onOrder,
  onActor,
}: {
  data: InspectionAuditPage;
  onPage: (page: number) => void;
  onOrder?: (id: string) => void;
  onActor?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div data-testid="inspection-audit-list">
      {!data.items.length && (
        <p className="async-state">За выбранный период действий нет.</p>
      )}
      {data.items.map((event) => {
        const changes =
          expanded === event.id
            ? auditChanges(event.metadata).filter(
                (change) => !["version", "updatedAt"].includes(change.key),
              )
            : [];
        const names = Object.fromEntries(
          (event.relatedActors ?? []).map((actor) => [
            actor.id,
            personName(actor),
          ]),
        );
        const metadata = evidenceRecord(event.metadata);
        const after = evidenceRecord(metadata.after);
        const newStatus = String(metadata.toStatus ?? after.status ?? "");
        const title =
          event.action === "order.transitioned" && newStatus in statusLabels
            ? `Статус: ${statusLabels[newStatus as keyof typeof statusLabels]}`
            : actionLabel(event.action);
        return (
          <article
            className="inspection-event"
            key={event.id}
            data-testid={`inspection-event-${event.id}`}
          >
            <div className="inspection-event-heading">
              <div>
                <div className="inspection-event-subject">
                  {event.orderNumber ? (
                    <button
                      className="inspection-order-link"
                      type="button"
                      disabled={!onOrder}
                      data-testid={`inspection-event-order-${event.id}`}
                      onClick={() => event.orderId && onOrder?.(event.orderId)}
                    >
                      Заказ №{event.orderNumber}
                    </button>
                  ) : (
                    <span>
                      {entityLabels[event.entityType] ?? "Запись"}
                      {typeof (
                        evidenceRecord(metadata.after).name ?? metadata.name
                      ) === "string"
                        ? ` · ${String(evidenceRecord(metadata.after).name ?? metadata.name)}`
                        : ""}
                    </span>
                  )}
                </div>
                <strong>{title}</strong>
                <p className="inspection-event-summary">
                  {auditSummary(event.metadata)}
                </p>
                <small>
                  {inspectionTime(event.createdAt)} ·{" "}
                  {event.actor ? personName(event.actor) : "Автор не сохранён"}
                  {event.actor && ` · ${roleLabels[event.actor.role]}`}
                </small>
              </div>
              <button
                type="button"
                className="secondary-button"
                data-testid={`inspection-event-expand-${event.id}`}
                aria-expanded={expanded === event.id}
                onClick={() =>
                  setExpanded(expanded === event.id ? null : event.id)
                }
              >
                {expanded === event.id ? "Свернуть" : "Подробнее"}
              </button>
            </div>
            {expanded === event.id && (
              <div className="inspection-event-body">
                {changes.length > 0 && (
                  <div className="inspection-change-list">
                    {changes.map((change) => (
                      <section key={change.key}>
                        <h4>{auditFieldLabels[change.key] ?? change.key}</h4>
                        <div className="inspection-before-after">
                          <div>
                            <strong>Было</strong>
                            <EvidenceValue
                              value={change.before}
                              names={names}
                            />
                          </div>
                          <div>
                            <strong>Стало</strong>
                            <EvidenceValue
                              value={change.after}
                              names={names}
                              field={change.key}
                            />
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {!changes.length && (
                  <p className="muted-text">
                    Для этого действия сравнение «до / после» не сохранено.
                  </p>
                )}
                <details>
                  <summary>Технические сведения</summary>
                  <EvidenceValue value={event.metadata} />
                </details>
                <div className="inspection-event-actions">
                  {event.actor && onActor && (
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid={`inspection-event-actor-${event.id}`}
                      onClick={() => onActor(event.actor!.id)}
                    >
                      Все действия этого сотрудника
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}
      <InspectionPagination
        {...data}
        onPage={onPage}
        prefix="inspection-audit"
      />
    </div>
  );
}
