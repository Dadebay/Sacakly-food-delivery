import { useId } from "react";
export function DailyChart({
  title,
  unit,
  rows,
  onSelectDay,
}: {
  title: string;
  unit: string;
  rows: { date: string; value: number; secondary?: number }[];
  onSelectDay: (date: string) => void;
}) {
  const id = useId();
  const width = 680,
    height = 230,
    left = 45,
    bottom = 30,
    top = 20;
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  const step = (width - left - 10) / Math.max(1, rows.length);
  const plotHeight = height - bottom - top;
  const countGraph = rows.some((row) => row.secondary !== undefined);
  return (
    <section
      className="inspection-chart inspection-daily-chart"
      data-testid={
        countGraph ? "inspection-orders-chart" : "inspection-revenue-chart"
      }
    >
      <h3>{title}</h3>
      <div className="inspection-chart-legend">
        <span>● {countGraph ? "Все заказы" : "Возврат денег"}</span>
        {countGraph && <span>● Отменённые</span>}
        <small>{unit}</small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}>
        <title id={id}>
          {title}. {rows.length} дней. Данные по дням доступны в списке под
          графиком.
        </title>
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1={left}
              x2={width}
              y1={height - bottom - fraction * plotHeight}
              y2={height - bottom - fraction * plotHeight}
              stroke="currentColor"
              opacity=".12"
            />
            <text
              x={left - 8}
              y={height - bottom - fraction * plotHeight + 4}
              textAnchor="end"
              fontSize="12"
              fill="currentColor"
            >
              {Math.round(maximum * fraction)}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const x = left + index * step + step * 0.15,
            h = (row.value / maximum) * plotHeight;
          return (
            <g key={row.date}>
              <rect
                x={x}
                y={height - bottom - h}
                width={step * 0.7}
                height={h}
                rx="2"
                fill="var(--brand-navy)"
              >
                <title>
                  {row.date}: {row.value} {unit}
                </title>
              </rect>
              {row.secondary !== undefined && (
                <rect
                  x={x + step * 0.38}
                  y={height - bottom - (row.secondary / maximum) * plotHeight}
                  width={step * 0.32}
                  height={(row.secondary / maximum) * plotHeight}
                  rx="2"
                  fill="var(--brand-orange)"
                />
              )}
              {(rows.length <= 10 ||
                index % 5 === 0 ||
                index === rows.length - 1) && (
                <text
                  x={x + step * 0.35}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="12"
                  fill="currentColor"
                >
                  {row.date.slice(8)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <label className="inspection-chart-day-picker">
        Открыть заказы за день
        <select
          value=""
          data-testid={
            countGraph ? "inspection-chart-day" : "inspection-revenue-day"
          }
          onChange={(event) => {
            if (event.target.value) onSelectDay(event.target.value);
          }}
        >
          <option value="">Выберите день</option>
          {rows.map((row) => (
            <option key={row.date} value={row.date}>
              {row.date.slice(8)}.{row.date.slice(5, 7)} — {row.value} {unit}
              {countGraph ? `, отмен ${row.secondary ?? 0}` : ""}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary
          data-testid={
            countGraph ? "inspection-daily-values" : "inspection-revenue-values"
          }
        >
          Все значения по дням
        </summary>
        <div className="inspection-day-values">
          {rows.map((row) => (
            <button
              type="button"
              key={row.date}
              data-testid={`${countGraph ? "inspection-day" : "inspection-money-day"}-${row.date}`}
              onClick={() => onSelectDay(row.date)}
            >
              <time dateTime={row.date}>
                {row.date.slice(8)}.{row.date.slice(5, 7)}
              </time>
              <strong>
                {row.value} {unit}
              </strong>
              {countGraph && <small>Отмен: {row.secondary ?? 0}</small>}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}
