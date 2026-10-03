import type { Prisma } from "../generated/prisma/client";
import type { ReceiptPrintPlanResponseDto } from "./orders-response.dto";
import type { ReceiptPrinterJob } from "./receipt-print-plan";

/** Transport-confirmed kitchen instructions, less cancellations already queued.
 * Main copies never prove that a kitchen copy was sent. Manual copies repeat an
 * instruction; automatic edit tickets contain only additional portions.
 */
export async function outstandingKitchenJobs(
  tx: Prisma.TransactionClient,
  orderId: string,
  deductFullCancellation = false,
): Promise<ReceiptPrinterJob[]> {
  const aliasEvents = await tx.auditLog.findMany({
    where: {
      entityType: "Order",
      entityId: orderId,
      action: "receipt.legacy_item_aliases",
    },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const aliases = new Map<string, string>();
  for (const event of aliasEvents) {
    const metadata = event.metadata as {
      aliases: { from: string; to: string }[];
    };
    for (const alias of metadata.aliases) aliases.set(alias.from, alias.to);
  }
  const canonicalId = (id: string) => {
    const visited = new Set<string>();
    while (aliases.has(id) && !visited.has(id)) {
      visited.add(id);
      id = aliases.get(id)!;
    }
    return id;
  };
  const tasks = await tx.receiptPrintTask.findMany({
    where: { orderId, status: { not: "CANCELLED" } },
    orderBy: { sequence: "asc" },
  });
  const groups = new Map<string, ReceiptPrinterJob>();
  for (const task of tasks) {
    const cancellation = task.documentType === "CANCELLATION";
    if (!cancellation && task.status !== "DELIVERED") continue;
    if (
      cancellation &&
      !deductFullCancellation &&
      !task.eventKey.startsWith("ORDER_EDITED:")
    )
      continue;
    const plan = task.plan as unknown as ReceiptPrintPlanResponseDto;
    for (const job of plan.jobs) {
      const key = `${job.transport}:${job.printerIp}:${job.printerPort}`;
      const group = groups.get(key) ?? { ...job, items: [] };
      for (const item of job.items) {
        const id = canonicalId(item.id);
        let existing = group.items.find((value) => value.id === id);
        if (!existing) {
          existing = { ...item, id, quantity: 0 };
          group.items.push(existing);
        }
        existing.quantity = cancellation
          ? Math.max(0, existing.quantity - item.quantity)
          : task.eventKey.startsWith("MANUAL:")
            ? Math.max(existing.quantity, item.quantity)
            : existing.quantity + item.quantity;
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((job) => ({
      ...job,
      items: job.items.filter((item) => item.quantity > 0),
    }))
    .filter((job) => job.items.length > 0);
}
