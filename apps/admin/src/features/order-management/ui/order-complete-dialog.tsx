import { useEffect, useId, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type Courier, type Order } from "@/src/entities/order";
import { ApiError } from "@/src/shared/api/api-client";
import { FormFieldError } from "@/src/shared/forms";
import { useOrderActions } from "../api/use-order-actions";
import {
  orderCompleteFormSchema,
  type OrderCompleteFormValues,
} from "../model/order-complete-form";
import "./order-complete-dialog.css";

export function OrderCompleteDialog({
  order,
  couriers,
  couriersPending,
  couriersError,
  onRetryCouriers,
  onClose,
  onCompleted,
  returnFocusTestId,
}: {
  order: Order;
  couriers: Courier[];
  couriersPending: boolean;
  couriersError: Error | null;
  onRetryCouriers: () => void;
  onClose: () => void;
  onCompleted: () => void;
  returnFocusTestId: string;
}) {
  const { adminComplete } = useOrderActions();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OrderCompleteFormValues>({
    resolver: zodResolver(orderCompleteFormSchema),
    defaultValues: {
      reason: "",
      cashReceived: false,
      courierId: order.courierId ?? "",
    },
  });
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        const trigger = document.querySelector<HTMLElement>(
          `[data-testid="${returnFocusTestId}"]`,
        );
        if (trigger) trigger.focus();
        else if (previous instanceof HTMLElement && previous.isConnected)
          previous.focus();
      });
    };
  }, [returnFocusTestId]);

  function submit(values: OrderCompleteFormValues) {
    if (!values.cashReceived) return;
    adminComplete.mutate(
      {
        orderId: order.id,
        body: {
          reason: values.reason,
          cashReceived: values.cashReceived,
          version: order.version,
          ...(!order.courierId ? { courierId: values.courierId } : {}),
        },
      },
      {
        onSuccess: () => {
          onCompleted();
          onClose();
        },
      },
    );
  }

  const conflict =
    adminComplete.error instanceof ApiError &&
    adminComplete.error.status === 409;
  const courierName =
    order.courier &&
    ([order.courier.firstName, order.courier.lastName]
      .filter(Boolean)
      .join(" ") ||
      order.courier.phone);
  return (
    <dialog
      ref={ref}
      className="modal order-complete-dialog"
      aria-labelledby={titleId}
      data-testid="order-complete-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!adminComplete.isPending) onClose();
      }}
    >
      <header className="modal-head">
        <h2 id={titleId}>Завершить заказ №{order.number}</h2>
        <button
          type="button"
          aria-label="Закрыть окно"
          data-testid="order-complete-close"
          disabled={adminComplete.isPending}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="order-complete-notice">
        Завершайте заказ только после доставки и получения всей суммы —{" "}
        <strong>{order.total} TMT</strong>, включая доставку. Деньги должны быть
        уже получены и сданы администратору.
      </p>
      <form
        noValidate
        data-testid="order-complete-form"
        onSubmit={handleSubmit(submit)}
      >
        {order.courierId ? (
          <p data-testid="order-complete-assigned-courier">
            Курьер: <strong>{courierName || "Назначенный курьер"}</strong>
          </p>
        ) : (
          <label>
            <span>Кто доставил заказ</span>
            <select
              {...register("courierId")}
              data-testid="order-complete-courier"
              aria-invalid={Boolean(errors.courierId)}
              disabled={
                adminComplete.isPending ||
                couriersPending ||
                Boolean(couriersError)
              }
            >
              <option value="">Выберите настоящего курьера</option>
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {[courier.firstName, courier.lastName]
                    .filter(Boolean)
                    .join(" ") || courier.phone}
                </option>
              ))}
            </select>
            <FormFieldError message={errors.courierId?.message} />
            {couriersPending && (
              <small role="status">Загружаем курьеров…</small>
            )}
            {couriersError && (
              <span role="alert">
                Не удалось загрузить курьеров.{" "}
                <button
                  type="button"
                  className="secondary-button compact"
                  data-testid="order-complete-couriers-retry"
                  onClick={onRetryCouriers}
                >
                  Повторить
                </button>
              </span>
            )}
            {!couriersPending && !couriersError && !couriers.length && (
              <small>
                Нет доступных курьеров. Добавьте сотрудника с ролью «Курьер» и
                повторите.
              </small>
            )}
          </label>
        )}
        <label>
          <span>Подробная причина завершения администратором</span>
          <textarea
            {...register("reason")}
            data-testid="order-complete-reason"
            aria-invalid={Boolean(errors.reason)}
            rows={5}
            maxLength={500}
            autoFocus
            disabled={adminComplete.isPending}
            placeholder="Что произошло с приложением курьера? Как вы проверили доставку и получение денег?"
          />
          <FormFieldError message={errors.reason?.message} />
          <small>
            От 20 до 500 символов. Полная причина и ваше имя сохранятся в
            истории заказа.
          </small>
        </label>
        <label className="order-complete-confirmation">
          <input
            type="checkbox"
            {...register("cashReceived")}
            data-testid="order-complete-cash"
            aria-invalid={Boolean(errors.cashReceived)}
            disabled={adminComplete.isPending}
          />
          <span>
            Подтверждаю: заказ доставлен, вся сумма {order.total} TMT получена и
            сдана мне.
          </span>
        </label>
        <FormFieldError message={errors.cashReceived?.message} />
        {adminComplete.error && (
          <p
            className="inline-alert"
            role="alert"
            data-testid="order-complete-error"
          >
            {conflict
              ? "Заказ изменился или уже завершён. Закройте окно и откройте заказ заново: данные обновлены."
              : adminComplete.error.message}
          </p>
        )}
        <footer className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            data-testid="order-complete-cancel"
            disabled={adminComplete.isPending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="primary-button"
            data-testid="order-complete-submit"
            disabled={
              adminComplete.isPending ||
              conflict ||
              (!order.courierId && (couriersPending || Boolean(couriersError)))
            }
          >
            {adminComplete.isPending ? "Завершаем…" : "Завершить заказ"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
