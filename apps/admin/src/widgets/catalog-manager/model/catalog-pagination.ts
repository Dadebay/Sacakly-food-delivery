export const CATALOG_PRODUCT_PAGE_SIZE = 40;

export function catalogPageRange(
  page: number,
  pageSize: number,
  total: number,
) {
  if (total <= 0) return { start: 0, end: 0 };
  const start = (page - 1) * pageSize + 1;
  return { start, end: Math.min(page * pageSize, total) };
}
