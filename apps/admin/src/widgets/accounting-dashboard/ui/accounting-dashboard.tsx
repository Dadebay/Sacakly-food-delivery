import { useState } from "react";
import { useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccountingShifts } from "@/src/entities/accounting";
import { useSession } from "@/src/shared/auth";
import { FormFieldError } from "@/src/shared/forms";
import {
  accountingMonthRange,
  accountingMonthSchema,
  accountingRangeSchema,
  type AccountingRangeValues,
} from "../model/accounting-forms";
import { AccountingInspection } from "./accounting-inspection";
import { AccountingCash } from "./accounting-cash";
import "./inspection.css";

const sections = [
  ["orders", "Заказы"],
  ["shifts", "Смены и деньги"],
  ["overview", "Графики"],
  ["audit", "Кто что сделал"],
  ["in", "Принято от смены"],
  ["out", "Передано смене"],
] as const;
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
export function AccountingDashboard() {
  const { session } = useSession();
  const canInspect =
    session?.user.role === "ACCOUNTANT" || session?.user.role === "SUPER_ADMIN";
  const [params, setParams] = useSearchParams();
  const [today] = useState(() =>
    new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10),
  );
  const range = {
    fromDate: params.get("fromDate") ?? today,
    toDate: params.get("toDate") ?? today,
  };
  const view = canInspect
    ? sections.some(([key]) => key === params.get("inspection"))
      ? params.get("inspection")!
      : "orders"
    : "shifts";
  const shifts = useAccountingShifts(range.fromDate, range.toDate);
  const monthForm = useForm<{ month: string }>({
    resolver: zodResolver(accountingMonthSchema),
    values: { month: range.fromDate.slice(0, 7) },
  });
  const rangeForm = useForm<AccountingRangeValues>({
    resolver: zodResolver(accountingRangeSchema),
    values: range,
  });
  function setRange(value: AccountingRangeValues, section?: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("fromDate", value.fromDate);
      next.set("toDate", value.toDate);
      if (section) next.set("inspection", section);
      for (const key of [
        "shift",
        "inspectionPage",
        "order",
        "historyPage",
        "orderNumber",
      ])
        next.delete(key);
      return next;
    });
  }
  function selectSection(section: string) {
    if (section === "overview" && !params.has("fromDate")) {
      setRange(accountingMonthRange(today.slice(0, 7)), section);
      return;
    }
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("inspection", section);
      for (const key of ["inspectionPage", "order", "historyPage"])
        next.delete(key);
      return next;
    });
  }
  return (
    <section
      className="admin-section accounting-dashboard"
      data-testid="accounting-dashboard"
    >
      <header className="section-head">
        <div>
          <h1>Бухгалтерия</h1>
          <p>Каждый заказ, участники и движение денег</p>
        </div>
      </header>
      <section
        className="accounting-period editor-card"
        aria-label="Период отчёта"
        data-testid="accounting-period"
      >
        <div className="accounting-period-heading">
          <strong>
            {range.fromDate === range.toDate
              ? dateLabel(range.fromDate)
              : `${dateLabel(range.fromDate)} — ${dateLabel(range.toDate)}`}
          </strong>
          <span>Время Ашхабада</span>
        </div>
        <div className="accounting-period-controls">
          <div className="accounting-presets">
            <button
              data-testid="accounting-today"
              type="button"
              onClick={() => setRange({ fromDate: today, toDate: today })}
            >
              Сегодня
            </button>
            <button
              data-testid="accounting-yesterday"
              type="button"
              onClick={() => {
                const day = new Date(
                  new Date(`${today}T00:00:00Z`).getTime() - 86400000,
                )
                  .toISOString()
                  .slice(0, 10);
                setRange({ fromDate: day, toDate: day });
              }}
            >
              Вчера
            </button>
          </div>
          <form
            className="accounting-month-picker"
            data-testid="accounting-month-form"
            onSubmit={monthForm.handleSubmit(({ month }) =>
              setRange(
                accountingMonthRange(month),
                canInspect ? "overview" : "shifts",
              ),
            )}
          >
            <label>
              Месяц
              <input
                type="month"
                data-testid="accounting-month"
                {...monthForm.register("month")}
              />
              <FormFieldError
                message={monthForm.formState.errors.month?.message}
              />
            </label>
            <button
              type="submit"
              className="primary-button"
              data-testid="accounting-month-apply"
            >
              Отчёт за месяц
            </button>
          </form>
          <details className="accounting-custom-period">
            <summary data-testid="accounting-custom-period">
              Другие даты
            </summary>
            <form
              className="accounting-range"
              data-testid="accounting-range-form"
              onSubmit={rangeForm.handleSubmit((value) => setRange(value))}
            >
              <label>
                С даты
                <input
                  type="date"
                  data-testid="accounting-from"
                  {...rangeForm.register("fromDate")}
                />
                <FormFieldError
                  message={rangeForm.formState.errors.fromDate?.message}
                />
              </label>
              <label>
                По дату
                <input
                  type="date"
                  data-testid="accounting-to"
                  {...rangeForm.register("toDate")}
                />
                <FormFieldError
                  message={rangeForm.formState.errors.toDate?.message}
                />
              </label>
              <button
                type="submit"
                className="secondary-button"
                data-testid="accounting-range-apply"
              >
                Показать
              </button>
            </form>
          </details>
        </div>
      </section>
      {canInspect && (
        <nav
          className="accounting-workspace-nav"
          aria-label="Разделы бухгалтерии"
        >
          {sections.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={view === key ? "page" : undefined}
              className={view === key ? "is-active" : ""}
              data-testid={`inspection-tab-${key}`}
              onClick={() => selectSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {view === "shifts" ? (
        <AccountingCash />
      ) : (
        <AccountingInspection
          fromDate={range.fromDate}
          toDate={range.toDate}
          shifts={shifts.data ?? []}
          shiftsError={shifts.error}
          onRetryShifts={() => void shifts.refetch()}
        />
      )}
    </section>
  );
}
