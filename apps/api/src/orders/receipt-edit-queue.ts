import { Prisma } from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import type { ReceiptPrintPlanResponseDto } from "./orders-response.dto";
import { outstandingKitchenJobs } from "./receipt-kitchen-history";
import {
  partialReceiptCustomerNote,
  ReceiptDocumentType,
} from "./receipt-print-plan";

type EditableReceiptItem = {
  id: string;
  productId: string;
  productVariantId: string | null;
  quantity: number;
  preparationMinutes: number;
  productName: string;
  variantName: string | null;
  unitPrice: unknown;
};

function receiptLineKey(
  item: Pick<EditableReceiptItem, "productId" | "productVariantId">,
) {
  return `${item.productId}:${item.productVariantId ?? "base"}`;
}

export async function reconcileReceiptsAfterItemEdit(
  tx: Prisma.TransactionClient,
  actor: AuthUser,
  orderId: string,
  version: number,
  previousItems: EditableReceiptItem[],
  currentItems: EditableReceiptItem[],
  currentPlan: ReceiptPrintPlanResponseDto,
) {
  const previousByKey = new Map(
    previousItems.map((item) => [receiptLineKey(item), item]),
  );
  const currentByKey = new Map(
    currentItems.map((item) => [receiptLineKey(item), item]),
  );
  const currentKeys = new Set(currentItems.map(receiptLineKey));
  const obsoleteIds = new Set(
    previousItems
      .filter((item) => !currentKeys.has(receiptLineKey(item)))
      .map((item) => item.id),
  );
  const currentById = new Map(currentItems.map((item) => [item.id, item]));
  const currentIdByPreviousId = new Map(
    previousItems.map((item) => [
      item.id,
      currentByKey.get(receiptLineKey(item))?.id,
    ]),
  );
  let printedJobs = await outstandingKitchenJobs(tx, orderId);
  // Older releases replaced every line UUID on edit. A unique unchanged
  // name/variant/price can recover that legacy identity without mutating the
  // frozen dispatch. Persist the alias so later portion changes add up across
  // both the old printed UUID and subsequent tickets with the retained UUID.
  const previousIdForPrinted = (item: {
    id: string;
    name: string;
    unitPrice: number;
  }) => {
    if (previousItems.some((previous) => previous.id === item.id))
      return item.id;
    const matches = previousItems.filter(
      (previous) =>
        (previous.variantName
          ? `${previous.productName} · ${previous.variantName}`
          : previous.productName) === item.name &&
        Number(previous.unitPrice) === item.unitPrice,
    );
    return matches.length === 1 ? matches[0]!.id : item.id;
  };
  const aliases = [
    ...new Map(
      printedJobs
        .flatMap((job) => job.items)
        .flatMap((item) => {
          const to = previousIdForPrinted(item);
          return to === item.id
            ? []
            : [[item.id, { from: item.id, to }] as const];
        }),
    ).values(),
  ];
  if (aliases.length) {
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "receipt.legacy_item_aliases",
        entityType: "Order",
        entityId: orderId,
        metadata: { version, aliases },
      },
    });
    printedJobs = await outstandingKitchenJobs(tx, orderId);
  }
  const printedByCurrentId = new Map<string, number>();
  for (const job of printedJobs)
    for (const item of job.items) {
      const currentId = currentIdByPreviousId.get(previousIdForPrinted(item));
      if (currentId)
        printedByCurrentId.set(
          currentId,
          Math.max(printedByCurrentId.get(currentId) ?? 0, item.quantity),
        );
    }
  const remainingQuantity = (id: string) =>
    Math.max(
      0,
      (currentById.get(id)?.quantity ?? 0) - (printedByCurrentId.get(id) ?? 0),
    );
  const cancellationJobs = printedJobs
    .map((job) => ({
      ...job,
      items: job.items
        .map((item) => {
          const currentId = currentIdByPreviousId.get(
            previousIdForPrinted(item),
          );
          return {
            ...item,
            quantity: Math.max(
              0,
              item.quantity -
                (currentId ? currentById.get(currentId)!.quantity : 0),
            ),
          };
        })
        .filter((item) => item.quantity > 0),
    }))
    .filter((job) => job.items.length > 0);
  const maxPreparation = Math.max(
    0,
    ...currentItems.map((item) => item.preparationMinutes),
  );
  const previousMaxPreparation = Math.max(
    0,
    ...previousItems.map((item) => item.preparationMinutes),
  );
  const hasNewLine = currentItems.some(
    (item) => !previousByKey.has(receiptLineKey(item)),
  );
  const resetSchedule = hasNewLine || maxPreparation !== previousMaxPreparation;
  const editedAt = new Date();
  const reissueOldIds = new Set<string>();
  const retainedPendingIds = new Set<string>();
  let cancelled = 0;
  let adjusted = 0;
  let cancelledMainCopies = 0;
  const tasks = await tx.receiptPrintTask.findMany({
    where: {
      orderId,
      documentType: "ORDER",
      status: { in: ["PENDING", "FAILED", "UNCERTAIN"] },
    },
    orderBy: { sequence: "asc" },
  });
  for (const task of tasks) {
    const plan = task.plan as unknown as ReceiptPrintPlanResponseDto;
    const hasObsoleteKitchenItem = plan.jobs.some((job) =>
      job.items.some((item) => obsoleteIds.has(item.id)),
    );
    const hasRemappedKitchenItem = plan.jobs.some((job) =>
      job.items.some((item) => {
        const currentId = currentIdByPreviousId.get(item.id);
        return currentId !== undefined && currentId !== item.id;
      }),
    );
    const hasChangedQuantity = plan.jobs.some((job) =>
      job.items.some((item) => {
        const currentId = currentIdByPreviousId.get(item.id);
        return (
          currentId !== undefined &&
          item.quantity !== remainingQuantity(currentId)
        );
      }),
    );
    const canChangeFrozenPlan =
      task.status === "PENDING" && task.attempts === 0;
    const keptJobs = plan.jobs
      .map((job) => ({
        ...job,
        items: job.items
          .filter((item) => !obsoleteIds.has(item.id))
          .map((item) => {
            const id = currentIdByPreviousId.get(item.id) ?? item.id;
            return { ...item, id, quantity: remainingQuantity(id) };
          })
          .filter((item) => item.quantity > 0),
      }))
      .filter((job) => job.items.length > 0);
    const mustCancel =
      Boolean(plan.mainJob) ||
      ((hasObsoleteKitchenItem || hasChangedQuantity) &&
        (!canChangeFrozenPlan || keptJobs.length === 0));
    if (mustCancel) {
      for (const job of plan.jobs)
        for (const item of job.items)
          if (!obsoleteIds.has(item.id)) reissueOldIds.add(item.id);
      if (plan.mainJob) cancelledMainCopies += 1;
      await tx.receiptPrintTask.update({
        where: { id: task.id },
        data: { status: "CANCELLED", lastError: "ORDER_ITEMS_CHANGED" },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.cancelled_after_order_edit",
          entityType: "ReceiptPrintTask",
          entityId: task.id,
          metadata: { orderId, version, removedItemIds: [...obsoleteIds] },
        },
      });
      cancelled += 1;
      continue;
    }
    for (const job of keptJobs)
      for (const item of job.items) retainedPendingIds.add(item.id);
    if (!canChangeFrozenPlan) continue;
    const firstItemId = keptJobs[0]?.items[0]?.id;
    const preparation = firstItemId
      ? currentById.get(firstItemId)?.preparationMinutes
      : undefined;
    const updatedDue =
      resetSchedule &&
      (task.eventKey.startsWith("ORDER_CREATED:") ||
        task.eventKey.startsWith("ORDER_EDITED:")) &&
      preparation !== undefined
        ? new Date(
            editedAt.getTime() +
              Math.max(0, maxPreparation - preparation) * 60_000,
          )
        : task.nextAttemptAt;
    if (
      hasObsoleteKitchenItem ||
      hasChangedQuantity ||
      hasRemappedKitchenItem ||
      updatedDue.getTime() !== task.nextAttemptAt.getTime()
    ) {
      await tx.receiptPrintTask.update({
        where: { id: task.id },
        data: {
          plan: { ...plan, jobs: keptJobs } as unknown as Prisma.InputJsonValue,
          nextAttemptAt: updatedDue,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.adjusted_after_order_edit",
          entityType: "ReceiptPrintTask",
          entityId: task.id,
          metadata: {
            orderId,
            version,
            removedItemIds: [...obsoleteIds],
            dueAt: updatedDue.toISOString(),
          },
        },
      });
      adjusted += 1;
    }
  }

  const revisionKey = `ORDER_EDITED:${orderId}:VERSION:${version}`;
  if (cancellationJobs.length) {
    const items = [
      ...new Map(
        cancellationJobs
          .flatMap((job) => job.items)
          .map((item) => [item.id, item]),
      ).values(),
    ];
    const task = await tx.receiptPrintTask.create({
      data: {
        orderId,
        eventKey: `${revisionKey}:CANCELLATION`,
        documentType: ReceiptDocumentType.CANCELLATION,
        plan: {
          ...currentPlan,
          documentType: ReceiptDocumentType.CANCELLATION,
          cancellationReason:
            "Изменение заказа: отмена указанных блюд или порций",
          mainJob: currentPlan.mainJob
            ? { ...currentPlan.mainJob, items }
            : null,
          mainCopies: 1,
          jobs: cancellationJobs,
          unassignedItems: [],
          metadata: currentPlan.metadata
            ? {
                ...currentPlan.metadata,
                customerNote: partialReceiptCustomerNote(
                  currentPlan.metadata.customerNote,
                ),
              }
            : null,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "receipt.kitchen_cancellation_after_order_edit",
        entityType: "ReceiptPrintTask",
        entityId: task.id,
        metadata: { orderId, version, itemIds: items.map((item) => item.id) },
      },
    });
  }
  for (
    let copy = 1;
    copy <= cancelledMainCopies && currentPlan.mainJob;
    copy += 1
  ) {
    const task = await tx.receiptPrintTask.create({
      data: {
        orderId,
        eventKey: `${revisionKey}:MAIN_COPY:${copy}`,
        documentType: currentPlan.documentType,
        plan: {
          ...currentPlan,
          mainCopies: 1,
          jobs: [],
          unassignedItems: [],
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "receipt.requeued_after_order_edit",
        entityType: "ReceiptPrintTask",
        entityId: task.id,
        metadata: { orderId, version, copyType: "MAIN" },
      },
    });
  }

  const reissueIds = new Set(
    currentItems
      .filter((item) => {
        const previous = previousByKey.get(receiptLineKey(item));
        return (
          !retainedPendingIds.has(item.id) &&
          remainingQuantity(item.id) > 0 &&
          (!previous ||
            reissueOldIds.has(previous.id) ||
            item.quantity > previous.quantity)
        );
      })
      .map((item) => item.id),
  );
  const preparationById = new Map(
    currentItems.map((item) => [item.id, item.preparationMinutes]),
  );
  const jobsByDelay = new Map<number, typeof currentPlan.jobs>();
  for (const job of currentPlan.jobs) {
    for (const item of job.items) {
      if (!reissueIds.has(item.id)) continue;
      const delay = maxPreparation - (preparationById.get(item.id) ?? 0);
      const jobs = jobsByDelay.get(delay) ?? [];
      const group = jobs.find(
        (candidate) =>
          candidate.printerIp === job.printerIp &&
          candidate.printerPort === job.printerPort &&
          candidate.transport === job.transport,
      );
      const remaining = { ...item, quantity: remainingQuantity(item.id) };
      if (group) group.items.push(remaining);
      else jobs.push({ ...job, items: [remaining] });
      jobsByDelay.set(delay, jobs);
    }
  }
  for (const [delay, jobs] of jobsByDelay) {
    const due = new Date(editedAt.getTime() + delay * 60_000);
    const task = await tx.receiptPrintTask.create({
      data: {
        orderId,
        eventKey: `${revisionKey}:KITCHEN:DELAY:${delay}`,
        documentType: currentPlan.documentType,
        plan: {
          ...currentPlan,
          mainJob: null,
          mainCopies: 1,
          jobs,
          unassignedItems: [],
        } as unknown as Prisma.InputJsonValue,
        nextAttemptAt: due,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "receipt.requeued_after_order_edit",
        entityType: "ReceiptPrintTask",
        entityId: task.id,
        metadata: {
          orderId,
          version,
          copyType: "KITCHEN",
          dueAt: due.toISOString(),
        },
      },
    });
  }
  return {
    cancelled,
    adjusted,
    queued: cancelledMainCopies + jobsByDelay.size,
  };
}
