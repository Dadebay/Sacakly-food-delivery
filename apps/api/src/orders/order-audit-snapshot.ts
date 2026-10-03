import type { Order, OrderItem } from "../generated/prisma/client";
import { toApiResponse } from "../common/api-response";

/** Business fields only: stable evidence independent of mutable catalog/users. */
export function orderAuditSnapshot(order: Order & { items: OrderItem[] }) {
  return toApiResponse({
    number: order.number,
    version: order.version,
    status: order.status,
    source: order.source,
    customerId: order.customerId,
    address: order.address,
    latitude: order.latitude,
    longitude: order.longitude,
    entrance: order.entrance,
    floor: order.floor,
    apartment: order.apartment,
    customerNote: order.customerNote,
    branchId: order.branchId,
    branchName: order.branchName,
    deliveryEtrapId: order.deliveryEtrapId,
    deliveryEtrapName: order.deliveryEtrapName,
    courierId: order.courierId,
    cookId: order.cookId,
    subtotal: order.subtotal,
    discount: order.discount,
    deliveryFee: order.deliveryFee,
    total: order.total,
    cancellationReason: order.cancellationReason,
    items: order.items.map((item) => ({
      productId: item.productId,
      productVariantId: item.productVariantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      preparationMinutes: item.preparationMinutes,
    })),
  });
}
