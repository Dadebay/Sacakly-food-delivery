import {
  OrderStatus,
  ReceiptPrinterTransport,
} from "../generated/prisma/client";

export enum ReceiptDocumentType {
  ORDER = "ORDER",
  CANCELLATION = "CANCELLATION",
}

const PARTIAL_RECEIPT_WARNING =
  "ВЫБОРОЧНАЯ ПЕЧАТЬ: указаны не все блюда. Итог ниже — по всему заказу.";

export function partialReceiptCustomerNote(customerNote: string | null) {
  const note = customerNote?.trim();
  if (!note) return PARTIAL_RECEIPT_WARNING;
  const availableNoteLength = 500 - [...PARTIAL_RECEIPT_WARNING].length - 1;
  return `${[...note].slice(0, availableNoteLength).join("")}\n${PARTIAL_RECEIPT_WARNING}`;
}

type ReceiptPrintSourceItem = {
  id: string;
  productName: string;
  variantName: string | null;
  receiptPrinterIp: string | null;
  receiptPrinterPort: number | null;
  receiptPrinterTransport: ReceiptPrinterTransport | null;
  unitPrice: unknown;
  quantity: number;
};

type ReceiptPrintSourceOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  cancellationReason: string | null;
  subtotal: unknown;
  discount: unknown;
  deliveryFee: unknown;
  total: unknown;
  deliveryEtrapName: string | null;
  items: ReceiptPrintSourceItem[];
  gifts?: { id: string; name: string; quantity: number; totalPoints: number }[];
};

export type ReceiptPrintItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type ReceiptPrinterJob = {
  printerIp: string;
  printerPort: number;
  transport: ReceiptPrinterTransport;
  items: ReceiptPrintItem[];
};

export type ReceiptPrinterEndpoint = Omit<ReceiptPrinterJob, "items">;

export type ReceiptPrintMetadata = {
  createdAt: string;
  cafeName: string | null;
  businessPhone: string | null;
  branchName: string | null;
  customerName: string | null;
  customerPhone: string;
  address: string;
  addressDetails: string | null;
  customerNote: string | null;
};

/** Each queued task is printable by the existing agent, which prints one main job. */
export function expandMainReceiptCopies<
  T extends {
    mainJob: object | null;
    mainCopies: number;
    jobs: object[];
    unassignedItems: object[];
  },
>(plan: T) {
  const first = { ...plan, mainCopies: 1 };
  const extraCopies = plan.mainJob
    ? Math.max(0, Math.min(3, plan.mainCopies) - 1)
    : 0;
  return [
    first,
    ...Array.from({ length: extraCopies }, () => ({
      ...first,
      jobs: [],
      unassignedItems: [],
    })),
  ];
}

export function buildReceiptPrintMetadata(
  order: {
    createdAt: Date;
    branchName: string | null;
    customer: {
      phone: string;
      firstName: string | null;
      lastName: string | null;
    };
    address: string;
    entrance: string | null;
    floor: string | null;
    apartment: string | null;
    customerNote: string | null;
  },
  businessPhone: string | null,
  cafeName: string | null = null,
): ReceiptPrintMetadata {
  return {
    createdAt: order.createdAt.toISOString(),
    cafeName,
    businessPhone,
    branchName: order.branchName,
    customerName:
      [order.customer.firstName, order.customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || null,
    customerPhone: order.customer.phone,
    address: order.address,
    addressDetails:
      [
        order.entrance ? `Подъезд: ${order.entrance}` : null,
        order.floor ? `Этаж: ${order.floor}` : null,
        order.apartment ? `Кв.: ${order.apartment}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    customerNote: order.customerNote,
  };
}

function toPrintItem(item: ReceiptPrintSourceItem): ReceiptPrintItem {
  return {
    id: item.id,
    name: item.variantName
      ? `${item.productName} · ${item.variantName}`
      : item.productName,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
  };
}

export function buildReceiptPrintPlan(
  order: ReceiptPrintSourceOrder,
  mainPrinter: ReceiptPrinterEndpoint | null,
  metadata: ReceiptPrintMetadata | null = null,
  mainCopies = 2,
) {
  const jobsByEndpoint = new Map<
    string,
    { endpoint: ReceiptPrinterEndpoint; items: ReceiptPrintItem[] }
  >();
  const unassignedItems: ReceiptPrintItem[] = [];
  const allItems: ReceiptPrintItem[] = [];

  for (const sourceItem of order.items) {
    const item = toPrintItem(sourceItem);
    allItems.push(item);
    if (!sourceItem.receiptPrinterIp) {
      unassignedItems.push(item);
      continue;
    }
    const endpoint = {
      printerIp: sourceItem.receiptPrinterIp,
      printerPort: sourceItem.receiptPrinterPort ?? 80,
      transport:
        sourceItem.receiptPrinterTransport ??
        ReceiptPrinterTransport.JSPEED_HTTP,
    };
    const key = `${endpoint.transport}:${endpoint.printerIp}:${endpoint.printerPort}`;
    const job = jobsByEndpoint.get(key) ?? { endpoint, items: [] };
    job.items.push(item);
    jobsByEndpoint.set(key, job);
  }

  for (const gift of order.gifts ?? []) {
    allItems.push({
      id: gift.id,
      name: `Подарок: ${gift.name} (${gift.totalPoints} баллов)`,
      quantity: gift.quantity,
      unitPrice: 0,
    });
  }

  return {
    orderId: order.id,
    orderNumber: order.number,
    metadata,
    documentType:
      order.status === OrderStatus.CANCELLED
        ? ReceiptDocumentType.CANCELLATION
        : ReceiptDocumentType.ORDER,
    cancellationReason:
      order.status === OrderStatus.CANCELLED
        ? order.cancellationReason?.trim() || null
        : null,
    summary: {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      deliveryFee: Number(order.deliveryFee),
      total: Number(order.total),
      deliveryAreaName: order.deliveryEtrapName,
    },
    mainJob: mainPrinter ? { ...mainPrinter, items: allItems } : null,
    mainCopies,
    jobs: [...jobsByEndpoint.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, { endpoint, items }]) => ({ ...endpoint, items })),
    unassignedItems,
  };
}
