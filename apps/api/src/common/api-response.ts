import { Prisma } from "../generated/prisma/client";

export type ApiResponse<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? number
    : T extends Array<infer U>
      ? ApiResponse<U>[]
      : T extends object
        ? { [K in keyof T]: ApiResponse<T[K]> }
        : T;

export function toApiResponse<T>(value: T): ApiResponse<T> {
  if (value instanceof Date) {
    return value.toISOString() as ApiResponse<T>;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber() as ApiResponse<T>;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) =>
      toApiResponse(item),
    ) as ApiResponse<T>;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toApiResponse(item)]),
    ) as ApiResponse<T>;
  }
  return value as ApiResponse<T>;
}
