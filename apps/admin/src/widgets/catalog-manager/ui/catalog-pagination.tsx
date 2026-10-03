import { catalogPageRange } from "../model/catalog-pagination";

export function CatalogPagination({
  page,
  pageSize,
  total,
  totalPages,
  isFetching,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  if (total <= 0) return null;
  const range = catalogPageRange(page, pageSize, total);

  return (
    <nav
      aria-busy={isFetching}
      aria-label="Страницы каталога"
      className="table-pagination"
      data-testid="catalog-product-pagination"
    >
      <span data-testid="catalog-product-pagination-range">
        {range.start}–{range.end} из {total}
        {isFetching ? " · обновляем…" : ""}
      </span>
      <div>
        <button
          className="secondary-button compact"
          data-testid="catalog-product-previous-page"
          disabled={isFetching || page <= 1}
          type="button"
          onClick={() => onPageChange(page - 1)}
        >
          Назад
        </button>
        <span aria-live="polite">
          {page} / {totalPages}
        </span>
        <button
          className="secondary-button compact"
          data-testid="catalog-product-next-page"
          disabled={isFetching || page >= totalPages}
          type="button"
          onClick={() => onPageChange(page + 1)}
        >
          Далее
        </button>
      </div>
    </nav>
  );
}
