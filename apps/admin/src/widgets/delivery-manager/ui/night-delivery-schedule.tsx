import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { DeliveryConfig } from "@/src/entities/delivery";
import { useDeliveryActions } from "@/src/features/delivery-management";
import { FormFieldError } from "@/src/shared/forms";
import {
  deliveryNightScheduleSchema,
  type DeliveryNightScheduleValues,
} from "../model/delivery-form";

export function NightDeliverySchedule({
  config,
  onReload,
}: {
  config: DeliveryConfig | undefined;
  onReload: () => void;
}) {
  const { updateSettings } = useDeliveryActions();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<DeliveryNightScheduleValues>({
    resolver: zodResolver(deliveryNightScheduleSchema),
    mode: "onBlur",
    defaultValues: {
      version: config?.version ?? 1,
      nightTariffEnabled: config?.nightTariffEnabled ?? false,
      nightStartsAt: config?.nightStartsAt ?? "23:00",
      nightEndsAt: config?.nightEndsAt ?? "07:00",
    },
  });
  useEffect(() => {
    if (!config) return;
    reset({
      version: config?.version ?? 1,
      nightTariffEnabled: config?.nightTariffEnabled ?? false,
      nightStartsAt: config?.nightStartsAt ?? "23:00",
      nightEndsAt: config?.nightEndsAt ?? "07:00",
    });
  }, [config, reset]);
  async function save(values: DeliveryNightScheduleValues) {
    try {
      await updateSettings.mutateAsync(values);
    } catch {
      /* Mutation state displays the API error. */
    }
  }
  return (
    <form
      className="editor-card"
      data-testid="delivery-night-form"
      noValidate
      onSubmit={handleSubmit(save)}
    >
      <div className="editor-title">
        <div>
          <h2>Ночной тариф</h2>
          <p>
            Время Ашхабада. Ночью действуют отдельные цены за километр или
            районные цены и пороги бесплатной доставки — по выбранному способу расчёта.
          </p>
        </div>
        <span
          className={`state-pill ${config?.nightTariffEnabled ? "is-on" : "is-off"}`}
          data-testid="delivery-night-status"
        >
          {!config
            ? "Загрузка…"
            : config.nightTariffEnabled
              ? `${config.nightStartsAt}–${config.nightEndsAt}`
              : "Выключен"}
        </span>
      </div>
      <div className="form-grid delivery-directory-grid">
        <label className="check-field">
          <input
            type="checkbox"
            data-testid="delivery-night-enabled"
            disabled={!config || updateSettings.isPending}
            {...register("nightTariffEnabled")}
          />
          Включить ночной тариф
        </label>
        <label>
          <span>Начало</span>
          <input
            type="time"
            data-testid="delivery-night-start"
            disabled={!config || updateSettings.isPending}
            {...register("nightStartsAt")}
            aria-invalid={Boolean(errors.nightStartsAt)}
          />
          <FormFieldError message={errors.nightStartsAt?.message} />
        </label>
        <label>
          <span>Конец</span>
          <input
            type="time"
            data-testid="delivery-night-end"
            disabled={!config || updateSettings.isPending}
            {...register("nightEndsAt")}
            aria-invalid={Boolean(errors.nightEndsAt)}
          />
          <FormFieldError message={errors.nightEndsAt?.message} />
        </label>
      </div>
      <p className="delivery-directory-note">
        Цена определяется при оформлении заказа. Время начала включено в ночной
        тариф, время окончания — уже дневной тариф.
      </p>
      {updateSettings.isError && (
        <div className="inline-alert" role="alert">
          {updateSettings.error.message}{" "}
          <button
            type="button"
            className="text-button"
            data-testid="delivery-night-reload"
            onClick={onReload}
          >
            Обновить настройки
          </button>
        </div>
      )}
      {updateSettings.isSuccess && (
        <div className="success-banner" role="status">
          Расписание ночного тарифа сохранено.
        </div>
      )}
      <div className="modal-actions">
        <button
          className="primary-button"
          data-testid="delivery-night-save"
          disabled={!config || updateSettings.isPending || !isDirty}
        >
          {updateSettings.isPending ? "Сохраняем…" : "Сохранить расписание"}
        </button>
      </div>
    </form>
  );
}
