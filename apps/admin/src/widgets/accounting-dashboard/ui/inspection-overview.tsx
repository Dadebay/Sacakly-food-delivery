import {
  useAccountingReport,
  type InspectionOverview,
} from "@/src/entities/accounting";
import { AsyncPanel } from "@/src/shared/ui";
import { DailyChart } from "./inspection-daily-chart";
import { inspectionMoney } from "../model/inspection";

function Ranking({
  title,
  rows,
  money = false,
}: {
  title: string;
  rows: { name: string; count: number; foodAmount?: number }[];
  money?: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="inspection-chart">
      <h3>{title}</h3>
      {!rows.length && <p>Нет данных за период.</p>}
      <ol>
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            <div>
              <span>{row.name}</span>
              <strong>{row.count}</strong>
            </div>
            <meter
              min={0}
              max={max}
              value={row.count}
              aria-label={`${row.name}: ${row.count}`}
            />
            {money && (
              <small>Еда: {inspectionMoney(row.foodAmount ?? 0)}</small>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InspectionOverviewPanel({
  data,
  onSelectDay,
  fromDate,
  toDate,
  showRevenue,
}: {
  data: InspectionOverview;
  onSelectDay: (date: string, basis?: "created" | "cashReturned") => void;
  fromDate: string;
  toDate: string;
  showRevenue: boolean;
}) {
  const { summary } = data;
  const report = useAccountingReport(fromDate, toDate, false, showRevenue);
  const amounts = new Map(
    report.data?.daily.map((day) => [day.date, day.amount]) ?? [],
  );
  return (
    <div data-testid="inspection-overview">
      <div className="accounting-metrics inspection-metrics">
        <article>
          <small>Создано заказов</small>
          <strong>{summary.createdOrders}</strong>
        </article>
        <article>
          <small>Отменено из этих заказов</small>
          <strong>
            {summary.cancelledOrders} · {summary.cancellationRate}%
          </strong>
        </article>
        <article>
          <small>Еда по неотменённым заказам</small>
          <strong>{inspectionMoney(summary.orderedFoodAmount)}</strong>
        </article>
        <article>
          <small>Доставлено, деньги ещё не вернули</small>
          <strong>{inspectionMoney(summary.deliveredUnreturnedAmount)}</strong>
        </article>
      </div>
      <div className="inspection-chart-grid">
        <DailyChart
          title="Заказы по дням"
          unit="заказов"
          rows={data.daily.map((day) => ({
            date: day.date,
            value: day.orders,
            secondary: day.cancelled,
          }))}
          onSelectDay={onSelectDay}
        />
        {showRevenue && (
          <AsyncPanel
            pending={report.isPending}
            error={report.error}
            onRetry={() => void report.refetch()}
          >
            {report.data && (
              <DailyChart
                title="Получено денег за еду"
                unit="TMT"
                rows={data.daily.map((day) => ({
                  date: day.date,
                  value: amounts.get(day.date) ?? 0,
                }))}
                onSelectDay={(date) => onSelectDay(date, "cashReturned")}
              />
            )}
          </AsyncPanel>
        )}
      </div>
      <p className="muted-text">
        Заказы — по дате создания. Деньги — по фактическому возврату, без
        доставки. Для просмотра заказов выберите день под графиком.
      </p>
      <div className="inspection-chart-grid">
        <Ranking title="Районы доставки" rows={data.districts} money />
        <Ranking title="Филиалы приготовления" rows={data.branches} money />
        <Ranking
          title="Заказывают чаще"
          rows={data.mostOrderedProducts.map((item) => ({
            name: item.name,
            count: item.quantity,
          }))}
        />
        <Ranking
          title="Заказывают реже"
          rows={data.leastOrderedProducts.map((item) => ({
            name: item.name,
            count: item.quantity,
          }))}
        />
        <Ranking
          title="Причины отмен заказов периода"
          rows={data.cancellationReasons}
          money
        />
      </div>
      <p className="muted-text">
        За период: {summary.editEvents} редактирований и{" "}
        {summary.cancellationEvents} действий отмены.
      </p>
      <p className="muted-text">
        Популярность — количество порций в неотменённых заказах. В «реже» входят
        блюда, которые хотя бы раз заказали за период. Переименование блюда
        сохраняется отдельной исторической строкой.
      </p>
    </div>
  );
}
