import { useEffect, useMemo, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type {
  InspectionOrder,
  InspectionOrdersPage,
} from "@/src/entities/accounting";
import { statusLabels } from "@/src/entities/order";
import {
  inspectionMoney,
  inspectionTime,
  personName,
} from "../model/inspection";
import { InspectionPagination } from "./inspection-audit";
const rowId = (order: InspectionOrder) => order.id;
export function InspectionOrders({
  data,
  onOrder,
  onPage,
}: {
  data: InspectionOrdersPage;
  onOrder: (id: string) => void;
  onPage: (page: number) => void;
}) {
  const openOrderRef = useRef(onOrder);
  useEffect(() => { openOrderRef.current = onOrder; }, [onOrder]);
  const columns = useMemo<ColumnDef<InspectionOrder>[]>(
    () => [
      {
        id: "order",
        header: "Заказ / статус",
        cell: ({ row: { original: o } }) => (
          <div className="inspection-order-identity">
            <button
              className="inspection-order-link"
              type="button"
              data-testid={`inspection-open-order-${o.id}`}
              onClick={(event) => { event.currentTarget.focus(); openOrderRef.current(o.id); }}
            >
              Заказ №{o.number}
              <span aria-hidden="true">↗</span>
            </button>
            <time dateTime={o.createdAt}>{inspectionTime(o.createdAt)}</time>
            <span
              className={`inspection-status status-${o.status.toLowerCase()}`}
            >
              {statusLabels[o.status]}
            </span>
            {o.cancellationReason && (
              <p className="inspection-cancel-reason">{o.cancellationReason}</p>
            )}
          </div>
        ),
      },
      {
        id: "courier",
        header: "Курьер",
        cell: ({ row: { original: o } }) => (
          <div className="inspection-order-person">
            <strong>{o.courier ? personName(o.courier) : "Не назначен"}</strong>
            <small>
              {o.source === "STAFF_PHONE"
                ? "Заказ по телефону"
                : "Заказ из приложения"}
            </small>
          </div>
        ),
      },
      {
        id: "location",
        header: "Куда / откуда",
        cell: ({ row: { original: o } }) => (
          <div className="inspection-order-location">
            <strong>{o.deliveryEtrapName ?? "Район не указан"}</strong>
            <span>{o.address}</span>
            <small>Кухня: {o.branchName ?? "не указана"}</small>
          </div>
        ),
      },
      {
        id: "amount",
        header: "Сумма",
        cell: ({ row: { original: o } }) => (
          <div className="inspection-order-amount">
            <strong>{inspectionMoney(o.foodAmount)}</strong>
            <small>за еду</small>
            <span>Доставка {inspectionMoney(o.deliveryFee)}</span>
          </div>
        ),
      },
    ],
    [],
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: data.items,
    getRowId: rowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount: data.total,
    state: { pagination: { pageIndex: data.page - 1, pageSize: data.limit } },
  });
  return (
    <div data-testid="inspection-orders">
      <div className="inspection-list-heading">
        <strong>Найдено заказов: {data.total}</strong>
        <span>Нажмите номер для подробностей</span>
      </div>
      <div className="inspection-orders-scroll">
        <table
          className="inspection-orders-table"
          aria-label="Заказы за выбранный период"
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} scope="col">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`inspection-cell-${cell.column.id}`}
                    data-label={String(cell.column.columnDef.header)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.items.length && (
        <div className="inspection-empty">
          <strong>Заказы не найдены.</strong>
          <p>Проверьте период, номер и выбранный статус.</p>
        </div>
      )}
      <InspectionPagination
        {...data}
        onPage={onPage}
        prefix="inspection-orders"
      />
    </div>
  );
}
