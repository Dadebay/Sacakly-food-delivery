import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import type { Courier, Order } from "@/src/entities/order";
import { FormFieldError } from "@/src/shared/forms";
import { useOrderActions } from "../api/use-order-actions";
import {
  orderCourierEditFormSchema,
  type OrderCourierEditFormValues,
} from "../model/order-courier-edit-form";

function personName(courier: Courier) {
  return (
    [courier.firstName, courier.lastName].filter(Boolean).join(" ") ||
    courier.phone
  );
}

export function OrderCourierEditDialog({
  order,
  couriers,
  onClose,
}: {
  order: Order;
  couriers: Courier[];
  onClose: () => void;
}) {
  const actions = useOrderActions();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OrderCourierEditFormValues>({
    resolver: zodResolver(orderCourierEditFormSchema),
    defaultValues: { courierId: order.courierId ?? "" },
  });
  const selectedCourierId = useWatch({ control, name: "courierId" });

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !actions.assignCourier.isPending) onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [actions.assignCourier.isPending, onClose]);

  async function submit(values: OrderCourierEditFormValues) {
    await actions.assignCourier.mutateAsync({
      orderId: order.id,
      courierId: values.courierId,
      version: order.version,
    });
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      data-testid="order-courier-edit-dialog"
      onMouseDown={(event) => {
        if (
          event.currentTarget === event.target &&
          !actions.assignCourier.isPending
        ) {
          onClose();
        }
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-courier-edit-title"
      >
        <header className="modal-head">
          <div>
            <span className="eyebrow">РЕДАКТИРОВАНИЕ ЗАКАЗА</span>
            <h2 id="order-courier-edit-title">
              Изменить курьера · #{order.number}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            disabled={actions.assignCourier.isPending}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <form
          data-testid="order-courier-edit-form"
          noValidate
          onSubmit={handleSubmit((values) => void submit(values))}
        >
          <label>
            <span>Курьер</span>
            <select
              data-testid="order-courier-edit-select"
              {...register("courierId")}
              aria-invalid={Boolean(errors.courierId)}
            >
              <option value="">Выберите курьера</option>
              {couriers.map((courier) => (
                <option key={courier.id} value={courier.id}>
                  {personName(courier)} · {courier.courierOrders.length} в работе
                </option>
              ))}
            </select>
            <FormFieldError message={errors.courierId?.message} />
          </label>

          <p className="form-hint">
            Изменение доступно только до того, как курьер начал доставку.
          </p>
          {actions.assignCourier.error && (
            <div className="inline-alert" role="alert">
              {actions.assignCourier.error.message}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={actions.assignCourier.isPending}
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="primary-button"
              data-testid="order-courier-edit-submit"
              disabled={
                actions.assignCourier.isPending ||
                selectedCourierId === order.courierId
              }
            >
              {actions.assignCourier.isPending
                ? "Сохраняем…"
                : "Сохранить курьера"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
