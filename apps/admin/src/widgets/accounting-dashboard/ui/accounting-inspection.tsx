import { useCallback, type Ref } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  useAccountingInspection,
  type AccountingShift,
} from "@/src/entities/accounting";
import {
  orderStatuses,
  statusLabels,
  type OrderStatus,
} from "@/src/entities/order";
import { AsyncPanel } from "@/src/shared/ui";
import { FormFieldError } from "@/src/shared/forms";
import {
  auditActionLabels,
  inspectionMoney,
  inspectionSearchSchema,
  inspectionTime,
} from "../model/inspection";
import {
  EvidenceValue,
  InspectionAuditList,
  InspectionPagination,
} from "./inspection-audit";
import { InspectionOrders } from "./inspection-orders";
import { InspectionOverviewPanel } from "./inspection-overview";
import { InspectionOrderDrawer } from "./inspection-order-drawer";
import "./inspection.css";

const tabs = [
  ["overview", "Сводка и графики"],
  ["orders", "Все заказы"],
  ["in", "Из предыдущей смены"],
  ["out", "Следующей смене"],
  ["audit", "Журнал действий"],
] as const;
const pageNumber = (value: string | null) =>
  Math.max(1, Math.min(100000, Number(value) || 1));

export function AccountingInspection({
  fromDate,
  toDate,
  shifts,
  ref,
  shiftsError,
  onRetryShifts,
}: {
  fromDate: string;
  toDate: string;
  shifts: AccountingShift[];
  ref?: Ref<HTMLElement>;
  shiftsError?: Error | null;
  onRetryShifts: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (values: Record<string, string | null>) =>
      setParams((previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }),
    [setParams],
  );
  const tab = tabs.some(([key]) => key === params.get("inspection"))
    ? params.get("inspection")!
    : "orders";
  const shiftKey = params.get("shift") ?? "";
  const selected = shifts.find((shift) => shift.shiftKey === shiftKey);
  const page = pageNumber(params.get("inspectionPage"));
  const orderId = params.get("order");
  const search = new URLSearchParams(
    shiftKey ? { shiftKey } : { fromDate, toDate },
  );
  const pageSearch = new URLSearchParams(search);
  pageSearch.set("page", String(page));
  pageSearch.set("limit", "25");
  const ordersSearch = new URLSearchParams(pageSearch);
  ordersSearch.set(
    "basis",
    params.get("orderBasis") === "cashReturned" ? "cashReturned" : "created",
  );
  const status = params.get("inspectionStatus");
  if (status && orderStatuses.includes(status as OrderStatus))
    ordersSearch.set("status", status);
  if (params.get("orderNumber"))
    ordersSearch.set("number", params.get("orderNumber")!);
  const auditSearch = new URLSearchParams(pageSearch);
  if (params.get("auditActor"))
    auditSearch.set("actorId", params.get("auditActor")!);
  if (params.get("auditAction"))
    auditSearch.set("action", params.get("auditAction")!);
  if (params.get("auditEntity"))
    auditSearch.set("entityType", params.get("auditEntity")!);
  const carrySearch = new URLSearchParams(pageSearch);
  carrySearch.set("direction", tab === "in" ? "in" : "out");
  const overview = useAccountingInspection(
    "overview",
    search.toString(),
    tab === "overview",
  );
  const orders = useAccountingInspection(
    "orders",
    ordersSearch.toString(),
    tab === "orders",
  );
  const audit = useAccountingInspection(
    "audit",
    auditSearch.toString(),
    tab === "audit",
  );
  const carryover = useAccountingInspection(
    "carryover",
    carrySearch.toString(),
    tab === "in" || tab === "out",
  );
  const form = useForm<z.infer<typeof inspectionSearchSchema>>({
    resolver: zodResolver(inspectionSearchSchema),
    values: { number: params.get("orderNumber") ?? "" },
  });
  const openOrder = useCallback(
    (id: string) => update({ order: id, historyPage: null }),
    [update],
  );
  const onPage = (next: number) => update({ inspectionPage: String(next) });

  return (
    <section
      ref={ref}
      className="editor-card accounting-inspection"
      data-testid="accounting-inspection"
    >
      <header className="editor-title">
        <div>
          <h2>
            {
              (
                {
                  orders: "Заказы",
                  overview: "Графики за период",
                  audit: "Кто что сделал",
                  in: "Принято от предыдущей смены",
                  out: "Передано следующей смене",
                } as Record<string, string>
              )[tab]
            }
          </h2>
          <p>
            {tab === "orders"
              ? "Нажмите номер заказа: состав, курьер, участники и история"
              : tab === "audit"
                ? "Номер заказа, сотрудник и результат каждого действия"
                : "За выбранные даты или одну смену"}
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          data-testid="inspection-refresh"
          onClick={() => {
            if (tab === "overview") void overview.refetch();
            if (tab === "orders") void orders.refetch();
            if (tab === "audit") void audit.refetch();
            if (tab === "in" || tab === "out") void carryover.refetch();
          }}
        >
          Обновить
        </button>
      </header>
      {shiftsError && (
        <div className="inline-alert" role="alert">
          Не удалось загрузить смены.{" "}
          <button
            type="button"
            data-testid="inspection-shifts-retry"
            onClick={onRetryShifts}
          >
            Повторить
          </button>
        </div>
      )}
      <label className="inspection-shift-label">
        Период проверки
        <select
          data-testid="inspection-shift"
          value={shiftKey}
          onChange={(event) =>
            update({
              shift: event.target.value,
              inspectionPage: null,
              order: null,
            })
          }
        >
          <option value="">
            Весь выбранный период: {fromDate} — {toDate}
          </option>
          {[...shifts].reverse().map((shift) => (
            <option key={shift.shiftKey} value={shift.shiftKey}>
              {shift.shiftName} · {inspectionTime(shift.periodStart)} —{" "}
              {inspectionTime(shift.periodEnd)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div className="inspection-shift-summary">
          <strong>{selected.shiftName}</strong>
          <span>
            Деньги за еду по системе: {inspectionMoney(selected.expectedAmount)}
          </span>
          <span>
            Ещё не передано бухгалтеру:{" "}
            {inspectionMoney(selected.availableAmount)}
          </span>
          {selected.handoff && (
            <>
              <span>
                Заявлено при сдаче:{" "}
                {inspectionMoney(selected.handoff.declaredAmount)}
              </span>
              <span>
                Расхождение:{" "}
                {inspectionMoney(
                  selected.handoff.declaredAmount -
                    selected.handoff.expectedAmount,
                )}
              </span>
              <span>
                Комментарий при сдаче: {selected.handoff.note || "Нет"}
              </span>
              <span>
                Проверка бухгалтера:{" "}
                {selected.handoff.confirmationNote || "Без комментария"}
              </span>
            </>
          )}
        </div>
      )}
      {tab === "overview" && (
        <AsyncPanel
          pending={overview.isPending}
          error={overview.error}
          onRetry={() => void overview.refetch()}
        >
          {overview.data && (
            <InspectionOverviewPanel
              data={overview.data}
              fromDate={fromDate}
              toDate={toDate}
              showRevenue={!shiftKey}
              onSelectDay={(date, basis = "created") =>
                update({
                  inspection: "orders",
                  orderBasis: basis,
                  inspectionStatus: null,
                  orderNumber: null,
                  fromDate: date,
                  toDate: date,
                  shift: null,
                  inspectionPage: null,
                  order: null,
                  historyPage: null,
                })
              }
            />
          )}
        </AsyncPanel>
      )}
      {tab === "orders" && (
        <>
          <form
            className="inspection-filters"
            data-testid="inspection-order-search"
            onSubmit={form.handleSubmit((value) =>
              update({ orderNumber: value.number, inspectionPage: null }),
            )}
          >
            <label className="inspection-number-filter">
              Номер заказа
              <input
                placeholder="Например, 52"
                inputMode="numeric"
                data-testid="inspection-order-number"
                {...form.register("number")}
              />
              <FormFieldError message={form.formState.errors.number?.message} />
            </label>
            <button
              className="secondary-button"
              data-testid="inspection-order-find"
              type="submit"
            >
              Найти
            </button>
            {params.get("orderNumber") && (
              <button
                type="button"
                className="secondary-button"
                data-testid="inspection-order-reset"
                onClick={() =>
                  update({ orderNumber: null, inspectionPage: null })
                }
              >
                Сбросить поиск
              </button>
            )}
            <details className="inspection-order-filters">
              <summary data-testid="inspection-order-filters">
                {params.get("orderBasis") === "cashReturned"
                  ? "По возврату денег"
                  : "По дате создания"}
                {status
                  ? ` · ${statusLabels[status as OrderStatus]}`
                  : " · Все статусы"}
              </summary>
              <div className="inspection-filter-options">
                {" "}
                <label className="inspection-shift-label">
                  Какие заказы показать
                  <select
                    data-testid="inspection-order-basis"
                    value={params.get("orderBasis") ?? "created"}
                    onChange={(event) =>
                      update({
                        orderBasis: event.target.value,
                        inspectionPage: null,
                      })
                    }
                  >
                    <option value="created">Созданные в этом периоде</option>
                    <option value="cashReturned">
                      Деньги возвращены в этот период
                    </option>
                  </select>
                </label>
                <label>
                  Статус
                  <select
                    value={status ?? ""}
                    data-testid="inspection-order-status"
                    onChange={(event) =>
                      update({
                        inspectionStatus: event.target.value,
                        inspectionPage: null,
                      })
                    }
                  >
                    <option value="">Все статусы</option>
                    {orderStatuses.map((value) => (
                      <option key={value} value={value}>
                        {statusLabels[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </form>
          <AsyncPanel
            pending={orders.isPending}
            error={orders.error}
            onRetry={() => void orders.refetch()}
          >
            {orders.data && (
              <InspectionOrders
                data={orders.data}
                onOrder={openOrder}
                onPage={onPage}
              />
            )}
          </AsyncPanel>
        </>
      )}
      {(tab === "in" || tab === "out") && (
        <AsyncPanel
          pending={carryover.isPending}
          error={carryover.error}
          onRetry={() => void carryover.refetch()}
        >
          {carryover.data && (
            <div data-testid="inspection-carryover">
              <p>
                {carryover.data.isProvisional
                  ? "Предварительно, период ещё не закончился. Текущий срез"
                  : tab === "in"
                    ? "Незавершённые заказы на начало периода"
                    : "Незавершённые заказы на конец периода"}
                : {inspectionTime(carryover.data.boundary)}. Всего:{" "}
                <strong>{carryover.data.total}</strong>.
              </p>
              <p className="muted-text">
                Готовка, сборка, доставка и доставленные заказы без возврата
                денег. Один заказ может переходить через несколько смен;
                передача не создаёт повторное начисление.
              </p>
              {carryover.data.items.map((order) => (
                <article className="inspection-event" key={order.id}>
                  <div className="inspection-event-heading">
                    <div>
                      <strong>
                        №{order.number} · {statusLabels[order.statusAtBoundary]}
                      </strong>
                      <small>
                        Создан: {inspectionTime(order.createdAt)} · Сейчас:{" "}
                        {statusLabels[order.status]}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      data-testid={`inspection-carry-order-${order.id}`}
                      onClick={() => openOrder(order.id)}
                    >
                      История заказа
                    </button>
                  </div>
                  {order.historicalSnapshotAvailable ? (
                    <details>
                      <summary>
                        Состав, адрес и суммы на момент передачи
                      </summary>
                      <EvidenceValue value={order.snapshot} />
                    </details>
                  ) : (
                    <p className="inline-alert">
                      Для старого изменения не сохранён полный снимок состава.
                      Статус восстановлен по истории; актуальные сведения
                      доступны в заказе.
                    </p>
                  )}
                </article>
              ))}
              {!carryover.data.items.length && (
                <p className="async-state">Переходящих заказов нет.</p>
              )}
              <InspectionPagination
                {...carryover.data}
                onPage={onPage}
                prefix="inspection-carryover"
              />
            </div>
          )}
        </AsyncPanel>
      )}
      {tab === "audit" && (
        <>
          <div className="inspection-filters">
            <label>
              Действие
              <select
                data-testid="inspection-audit-action"
                value={params.get("auditAction") ?? ""}
                onChange={(event) =>
                  update({
                    auditAction: event.target.value,
                    inspectionPage: null,
                  })
                }
              >
                <option value="">Все действия</option>
                {Object.entries(auditActionLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Раздел
              <select
                data-testid="inspection-audit-entity"
                value={params.get("auditEntity") ?? ""}
                onChange={(event) =>
                  update({
                    auditEntity: event.target.value,
                    inspectionPage: null,
                  })
                }
              >
                <option value="">Все разделы</option>
                {[
                  "Order",
                  "Product",
                  "Category",
                  "Cafe",
                  "CashHandoff",
                  "AccountingSettings",
                  "User",
                  "Branch",
                  "PromoCode",
                  "Banner",
                  "ReceiptPrintTask",
                  "OperationsRequest",
                ].map((value) => (
                  <option key={value} value={value}>
                    {
                      (
                        {
                          Order: "Заказы",
                          Product: "Блюда",
                          Category: "Категории",
                          Cafe: "Кафе",
                          CashHandoff: "Сдача денег",
                          AccountingSettings: "Смены",
                          User: "Сотрудники",
                          Branch: "Филиалы",
                          PromoCode: "Промокоды",
                          Banner: "Баннеры",
                          ReceiptPrintTask: "Печать",
                          OperationsRequest: "Отклонённые запросы",
                        } as Record<string, string>
                      )[value]
                    }
                  </option>
                ))}
              </select>
            </label>
            {params.get("auditActor") && (
              <button
                type="button"
                className="secondary-button"
                data-testid="inspection-audit-clear-actor"
                onClick={() =>
                  update({ auditActor: null, inspectionPage: null })
                }
              >
                Показать всех сотрудников
              </button>
            )}
          </div>

          <AsyncPanel
            pending={audit.isPending}
            error={audit.error}
            onRetry={() => void audit.refetch()}
          >
            {audit.data && (
              <InspectionAuditList
                data={audit.data}
                onPage={onPage}
                onOrder={openOrder}
                onActor={(id) =>
                  update({ auditActor: id, inspectionPage: null })
                }
              />
            )}
          </AsyncPanel>
        </>
      )}
      {orderId && (
        <InspectionOrderDrawer
          id={orderId}
          onClose={() => update({ order: null, historyPage: null })}
        />
      )}
    </section>
  );
}
