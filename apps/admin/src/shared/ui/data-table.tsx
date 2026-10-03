import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import type { CSSProperties, ReactNode } from "react";

declare module "@tanstack/react-table" {
  // Sayisal sutunlar sola dayali oldugunda basligindan kopuyor ve
  // buyuklukleri karsilastirilamiyor; sutun bunu kendisi bildirebilsin.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "end";
  }
}

function responsiveLabel<TData>(column: ColumnDef<TData, unknown>) {
  if (typeof column.header === "string" && column.header.trim()) {
    return column.header;
  }

  return column.id === "actions" ? "Действия" : "Поле";
}

export function DataTable<TData>({
  columns,
  data,
  empty = "Нет данных",
  getRowId,
  label,
  minWidth = 760,
  pageSize,
  variant = "default",
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  empty?: string;
  getRowId?: (row: TData) => string;
  label?: string;
  minWidth?: number;
  /** Verildiginde tablo istemci tarafinda sayfalanir. Yuzlerce satirlik
   *  listeler tek seferde cizilmesin diye. */
  pageSize?: number;
  variant?: "default" | "orders";
}) {
  // TanStack Table intentionally exposes a mutable table instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageIndex: 0, pageSize } },
        }
      : {}),
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  const tableStyle = {
    "--data-table-min-width": `${minWidth}px`,
  } as CSSProperties;

  return (
    <>
      <div className="data-table-scroll">
        <table
          aria-label={label}
          className={`data-table data-table--${variant}`}
          style={tableStyle}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    data-align={header.column.columnDef.meta?.align}
                    key={header.id}
                    scope="col"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td
                      data-align={cell.column.columnDef.meta?.align}
                      data-label={responsiveLabel(cell.column.columnDef)}
                      key={cell.id}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="table-empty" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageSize && data.length > pageSize && (
        <div className="table-pagination">
          <span>
            {pageIndex * pageSize + 1}–
            {Math.min((pageIndex + 1) * pageSize, data.length)} из{" "}
            {data.length}
          </span>
          <div>
            <button
              className="secondary-button compact"
              data-testid="data-table-previous-page"
              disabled={!table.getCanPreviousPage()}
              type="button"
              onClick={() => table.previousPage()}
            >
              Назад
            </button>
            <span>
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              className="secondary-button compact"
              data-testid="data-table-next-page"
              disabled={!table.getCanNextPage()}
              type="button"
              onClick={() => table.nextPage()}
            >
              Далее
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function AsyncPanel({
  pending,
  error,
  onRetry,
  children,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (pending) return <div className="async-state">Загружаем данные…</div>;
  if (error) {
    return (
      <div className="async-state error">
        <strong>Backend не ответил</strong>
        <p>{error.message}</p>
        <button className="secondary-button" onClick={onRetry}>
          Повторить
        </button>
      </div>
    );
  }
  return children;
}
