import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@sacakly/api-contract";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { orderingHoursFormSchema } from "../model/catalog-forms";

type Hours = components["schemas"]["OrderingHoursResponseDto"];
type Values = z.infer<typeof orderingHoursFormSchema>;

export function OrderingHoursSettings({ canEdit }: { canEdit: boolean }) {
  const { authorizedRequest, session } = useSession();
  const queryClient = useQueryClient();
  const key = ["ordering-hours", session?.user.id];
  const hours = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      authorizedRequest<Hours>("/ordering-hours", { signal }),
    enabled: Boolean(session),
    staleTime: 30_000,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(orderingHoursFormSchema),
    values: {
      enabled: hours.data?.enabled ?? false,
      opensAt: hours.data?.opensAt ?? "09:00",
      closesAt: hours.data?.closesAt ?? "22:00",
      version: hours.data?.version ?? 0,
    },
  });
  const update = useMutation({
    mutationFn: (body: Values) =>
      authorizedRequest<Hours>("/ordering-hours", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
  return (
    <form
      className="table-card"
      data-testid="ordering-hours-form"
      noValidate
      onSubmit={handleSubmit((value) => update.mutate(value))}
    >
      <h2>Время приёма заказов</h2>
      <p>
        Часовой пояс: Ашхабад. Приложение получает статус из API, а сервер
        проверяет время при создании заказа.
      </p>
      {hours.isPending && <p>Загружаем расписание…</p>}
      {hours.isError && (
        <p role="alert">
          Не удалось загрузить расписание.{" "}
          <button
            type="button"
            data-testid="ordering-hours-retry"
            onClick={() => void hours.refetch()}
          >
            Повторить
          </button>
        </p>
      )}
      {hours.data && (
        <>
          <label>
            <input
              type="checkbox"
              data-testid="ordering-hours-enabled"
              {...register("enabled")}
              disabled={!canEdit}
            />{" "}
            Ограничить время приёма заказов
          </label>
          <div className="form-grid">
            <label>
              <span>Открытие</span>
              <input
                type="time"
                data-testid="ordering-hours-open"
                {...register("opensAt")}
                disabled={!canEdit}
              />
              <FormFieldError message={errors.opensAt?.message} />
            </label>
            <label>
              <span>Закрытие</span>
              <input
                type="time"
                data-testid="ordering-hours-close"
                {...register("closesAt")}
                disabled={!canEdit}
              />
              <FormFieldError message={errors.closesAt?.message} />
            </label>
          </div>
          <p>
            Сейчас заказ {hours.data.isOpen ? "доступен" : "недоступен"}.
            Интервал через полночь поддерживается.
          </p>
          {canEdit && (
            <button
              className="primary-button"
              type="submit"
              data-testid="ordering-hours-submit"
              disabled={update.isPending}
            >
              Сохранить время работы
            </button>
          )}
          {update.isSuccess && <p role="status">Расписание сохранено.</p>}
          {update.isError && <p role="alert">{update.error.message}</p>}
        </>
      )}
    </form>
  );
}
