import type { components } from "@sacakly/api-contract";
import { useState } from "react";
import { useSession } from "@/src/shared/auth";
import { useReceiptQueue } from "../api/use-receipt-queue";
import { useReceiptPrinting } from "../api/use-receipt-printing";
import "./receipt-queue.css";

const labels: Record<
  components["schemas"]["ReceiptTaskResponseDto"]["status"],
  string
> = {
  PENDING: "Ожидает отправки",
  PROCESSING: "Отправляется",
  DELIVERED: "Передан аппарату",
  FAILED: "Требуется настройка",
  UNCERTAIN: "Проверьте бумажный чек",
  CANCELLED: "Отменён",
};
export function ReceiptQueue() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { session } = useSession();
  const canCancel = session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN";
  const { queue, history, agent, worker, retry, cancel, directMode } =
    useReceiptQueue(historyOpen);
  const reprint = useReceiptPrinting();
  const failure = retry.error ?? cancel.error ?? reprint.error;
  return (
    <details className="receipt-queue" data-testid="receipt-queue">
      <summary data-testid="receipt-queue-toggle">
        Печать:{" "}
        {queue.isError
          ? "нет связи с сервером"
          : queue.isPending
            ? "проверяем очередь…"
            : `${queue.data.pending} в очереди`}
        {Boolean(queue.data?.needsAttention) &&
          ` · проверить: ${queue.data?.needsAttention}`}
      </summary>
      <div className="receipt-queue-content">
        <p role="status" data-testid="receipt-queue-agent-status">
          {directMode
            ? "Программа печати получает чеки напрямую через API. Сайт можно закрыть."
            : agent.isError
              ? "Нет связи с программой печати или требуется её обновление. Очередь сохранена на сервере."
              : worker.isPending
                ? "Передаём чек аппаратам…"
                : worker.isError
                  ? "Связь прервалась. Сохранённое задание будет проверено повторно."
                  : "Оставьте сайт и программу печати открытыми. После восстановления связи очередь продолжится автоматически."}
        </p>
        {queue.isError && (
          <button
            type="button"
            data-testid="receipt-queue-refresh"
            onClick={() => void queue.refetch()}
          >
            Обновить очередь
          </button>
        )}
        {queue.data?.items.length === 0 && <p>Неотправленных чеков нет.</p>}
        {queue.data?.items.map((task) => (
          <div
            className="receipt-queue-item"
            key={task.id}
            data-testid={`receipt-queue-item-${task.id}`}
          >
            <strong>
              #{task.orderNumber} ·{" "}
              {task.documentType === "CANCELLATION" ? "Отмена" : "Заказ"}
            </strong>
            <span>
              {labels[task.status]} · попыток: {task.attempts}
            </span>
            {task.itemNames.length > 0 && (
              <small>Блюда: {task.itemNames.join(", ")}</small>
            )}
            {!directMode &&
              task.stationId &&
              task.stationId !== agent.data?.agentId && (
                <small>
                  Ожидает программу на компьютере, который начал отправку.
                </small>
              )}
            {task.lastError === "NO_PRINTERS" && (
              <small>Укажите аппарат в настройках и создайте новый чек.</small>
            )}
            {task.status === "PENDING" &&
              new Date(task.nextAttemptAt).getTime() <= queue.dataUpdatedAt && (
                <button
                  type="button"
                  disabled={retry.isPending}
                  data-testid={`receipt-queue-retry-${task.id}`}
                  onClick={() => retry.mutate(task.id)}
                >
                  Проверить снова
                </button>
              )}
            {task.status === "PENDING" &&
              new Date(task.nextAttemptAt).getTime() > queue.dataUpdatedAt && (
                <small>
                  Запланировано на{" "}
                  {new Date(task.nextAttemptAt).toLocaleString("ru-RU")}
                </small>
              )}
            {canCancel && task.status === "PENDING" && (
              <button
                type="button"
                className="danger-button"
                disabled={cancel.isPending}
                data-testid={`receipt-queue-cancel-${task.id}`}
                onClick={() => {
                  if (window.confirm("Отменить этот ожидающий чек? Уже переданный аппарату чек отменить нельзя."))
                    cancel.mutate(task.id);
                }}
              >
                Отменить чек
              </button>
            )}
            {(task.status === "UNCERTAIN" || task.status === "FAILED") && (
              <>
                {task.status === "UNCERTAIN" && (
                  <small>
                    Автоповтор остановлен: чек мог уже выйти. Сначала проверьте
                    аппарат.
                  </small>
                )}
                <button
                  type="button"
                  disabled={reprint.isPending}
                  data-testid={`receipt-queue-reprint-${task.id}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Создать новый чек? Уже вышедшие копии напечатаются повторно. Проверьте бумагу перед продолжением.",
                      )
                    )
                      reprint.mutate(task.orderId);
                  }}
                >
                  Создать новый чек
                </button>
              </>
            )}
          </div>
        ))}
        {(queue.data?.items.length ?? 0) >= 50 && (
          <small>
            Показаны первые 50 заданий. Остальные сохранены в очереди.
          </small>
        )}
        {reprint.isSuccess && (
          <p role="status">Новый чек добавлен в очередь.</p>
        )}
        {cancel.isSuccess && (
          <p role="status">Ожидающий чек отменён.</p>
        )}
        <details
          data-testid="receipt-queue-history"
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary data-testid="receipt-queue-history-toggle">
            Журнал печати
          </summary>
          {history.isPending && <p>Загружаем журнал…</p>}
          {history.isError && (
            <button
              type="button"
              data-testid="receipt-queue-history-retry"
              onClick={() => void history.refetch()}
            >
              Повторить загрузку
            </button>
          )}
          {history.data?.items.map((task) => (
            <div className="receipt-queue-item" key={task.id}>
              <strong>
                #{task.orderNumber} ·{" "}
                {task.documentType === "CANCELLATION"
                  ? "Отмена заказа"
                  : "Заказ"}
              </strong>
              <span>
                {labels[task.status]} ·{" "}
                {new Date(task.createdAt).toLocaleString("ru-RU")}
              </span>
              <small>
                Отправить после:{" "}
                {new Date(task.nextAttemptAt).toLocaleString("ru-RU")} ·
                попыток: {task.attempts}
              </small>
              {task.lastError && <small>Код: {task.lastError}</small>}
            </div>
          ))}
        </details>
        {failure && <p role="alert">{failure.message}</p>}
      </div>
    </details>
  );
}
