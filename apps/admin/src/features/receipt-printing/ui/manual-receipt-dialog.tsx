import { useEffect, useId, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { useForm, useWatch } from "react-hook-form";
import { useReceiptPrinters } from "@/src/entities/catalog";
import type { Order } from "@/src/entities/order";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import { useReceiptPrinting } from "../api/use-receipt-printing";
import {
  manualReceiptFormSchema,
  manualReceiptItemRoutes,
  type ManualReceiptFormValues,
} from "../model/manual-receipt-form";

type Plan = components["schemas"]["ReceiptPrintPlanResponseDto"];
type Printer = components["schemas"]["ReceiptPrinterResponseDto"];

export function ManualReceiptDialog({
  order,
  onClose,
  returnFocusTestId,
}: {
  order: Order;
  onClose: () => void;
  returnFocusTestId: string;
}) {
  const { authorizedRequest, session } = useSession();
  const canRoute =
    session?.user.role === "ADMIN" || session?.user.role === "SUPER_ADMIN";
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const print = useReceiptPrinting();
  const plan = useQuery({
    queryKey: ["manual-receipt-plan", order.id],
    queryFn: ({ signal }) =>
      authorizedRequest<Plan>(`/orders/${order.id}/receipt-print-plan`, {
        signal,
      }),
    staleTime: 0,
  });
  const printers = useReceiptPrinters();
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

  return (
    <dialog
      ref={ref}
      className="modal manual-receipt-dialog"
      aria-labelledby={titleId}
      data-testid="manual-receipt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!print.isPending) onClose();
      }}
    >
      <header className="manual-receipt-head">
        <h2 id={titleId}>Печать заказа №{order.number}</h2>
        <button
          type="button"
          className="modal-close"
          aria-label="Закрыть окно"
          data-testid="manual-receipt-close"
          disabled={print.isPending}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {(plan.isPending || printers.isPending) && (
        <p className="manual-receipt-message" role="status">
          Загружаем аппараты…
        </p>
      )}
      {(plan.isError || printers.isError) && (
        <p className="manual-receipt-message" role="alert">
          Не удалось загрузить аппараты.{" "}
          <button
            type="button"
            data-testid="manual-receipt-retry"
            onClick={() => {
              void plan.refetch();
              void printers.refetch();
            }}
          >
            Повторить
          </button>
        </p>
      )}
      {plan.data && printers.data && (
        <ManualReceiptForm
          order={order}
          plan={plan.data}
          printers={printers.data}
          canRoute={canRoute}
          print={print}
          onClose={onClose}
        />
      )}
    </dialog>
  );
}

function ManualReceiptForm({
  order,
  plan,
  printers,
  canRoute,
  print,
  onClose,
}: {
  order: Order;
  plan: Plan;
  printers: Printer[];
  canRoute: boolean;
  print: ReturnType<typeof useReceiptPrinting>;
  onClose: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualReceiptFormValues>({
    resolver: zodResolver(manualReceiptFormSchema),
    defaultValues: {
      mainCopies: plan.mainJob ? plan.mainCopies : 0,
      routes: order.items.map((item) => ({
        itemId: item.id,
        included: true,
        destination: "DEFAULT",
      })),
    },
  });
  const routes = useWatch({ control, name: "routes" });
  const mainCopies = useWatch({ control, name: "mainCopies" });
  const includedCount = routes.filter((route) => route.included).length;
  const assigned = new Map(
    plan.jobs.flatMap((job) =>
      job.items.map(
        (item) => [item.id, `${job.printerIp}:${job.printerPort}`] as const,
      ),
    ),
  );
  const submit = (values: ManualReceiptFormValues) => {
    print.mutate(
      {
        orderId: order.id,
        itemRoutes: manualReceiptItemRoutes(values),
        ...(canRoute ? { mainCopies: values.mainCopies } : {}),
      },
      { onSuccess: onClose },
    );
  };
  return (
    <form
      className="manual-receipt-form"
      noValidate
      onSubmit={handleSubmit(submit)}
      data-testid="manual-receipt-form"
    >
      <div className="manual-receipt-main">
        <label>
          <span>
            Главная касса
            {plan.mainJob ? ` · ${plan.mainJob.printerIp}` : " · не настроена"}
          </span>
          <select
            data-testid="manual-receipt-main-copies"
            aria-label="Копии для главной кассы"
            {...register("mainCopies", { valueAsNumber: true })}
            disabled={!canRoute || !plan.mainJob || print.isPending}
          >
            <option value="0">Не печатать на главной кассе</option>
            <option value="1">1 копия</option>
            <option value="2">2 копии</option>
            <option value="3">3 копии</option>
          </select>
        </label>
        <FormFieldError message={errors.mainCopies?.message} />
        <small>
          {mainCopies > 0
            ? "На главной кассе — все отмеченные блюда. Кухонный аппарат выбирается ниже."
            : "Главный чек не выйдет. Отмеченные блюда отправятся только на выбранные аппараты."}
        </small>
      </div>
      <div className="manual-receipt-body" data-testid="manual-receipt-body">
        <p className="manual-receipt-instructions">
          Отмечено: {includedCount} из {order.items.length}. Снимите галочку,
          чтобы совсем не печатать блюдо.
        </p>
        {order.items.map((item, index) => (
          <div className="manual-receipt-item" key={item.id}>
            <label className="manual-receipt-inclusion">
              <input
                type="checkbox"
                data-testid={`manual-receipt-include-${item.id}`}
                {...register(`routes.${index}.included`)}
                disabled={!canRoute || print.isPending}
              />
              <span>
                {item.productName}
                {item.variantName ? ` · ${item.variantName}` : ""} ×{" "}
                {item.quantity}
              </span>
            </label>
            <input type="hidden" {...register(`routes.${index}.itemId`)} />
            <div>
              <select
                aria-label={`Кухонный аппарат: ${item.productName}`}
                data-testid={`manual-receipt-route-${item.id}`}
                {...register(`routes.${index}.destination`)}
                disabled={
                  !routes[index]?.included || !canRoute || print.isPending
                }
              >
                <option value="DEFAULT">
                  {assigned.has(item.id)
                    ? `По настройке: ${assigned.get(item.id)}`
                    : "Кухня не назначена"}
                </option>
                {plan.mainJob && (
                  <option value="MAIN">Только главная касса</option>
                )}
                {printers
                  .filter((printer) => printer.isActive)
                  .map((printer) => (
                    <option key={printer.id} value={printer.id}>
                      {printer.name} · {printer.ipAddress}:{printer.port}
                    </option>
                  ))}
              </select>
              <FormFieldError
                message={errors.routes?.[index]?.destination?.message}
              />
            </div>
          </div>
        ))}
      </div>
      <footer className="manual-receipt-footer">
        <FormFieldError
          message={errors.routes?.root?.message ?? errors.routes?.message}
        />
        {includedCount < order.items.length && (
          <small>В частичном чеке указана сумма всего заказа.</small>
        )}
        <small>
          Печать сразу. Ожидающие автоматические чеки этого заказа будут
          отменены.
        </small>
        {print.isError && <p role="alert">{print.error.message}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            data-testid="manual-receipt-cancel"
            disabled={print.isPending}
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="primary-button"
            data-testid="manual-receipt-submit"
            disabled={print.isPending || includedCount === 0}
          >
            {print.isPending ? "Отправляем…" : "Напечатать сейчас"}
          </button>
        </div>
      </footer>
    </form>
  );
}
