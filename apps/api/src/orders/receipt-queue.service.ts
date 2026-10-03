import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import {
  AdminPage,
  Prisma,
  ReceiptPrintTaskStatus,
  Role,
  type ReceiptPrintTask,
} from "../generated/prisma/client";
import type { AuthUser } from "../common/auth.types";
import type { AppEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "./orders.service";
import {
  expandMainReceiptCopies,
  partialReceiptCustomerNote,
  ReceiptDocumentType,
} from "./receipt-print-plan";
import { ReceiptPrintPlanResponseDto } from "./orders-response.dto";
import {
  type ReceiptOutcomeDto,
  type ReceiptLeaseDto,
  type ReceiptAgentLeaseDto,
  type ReceiptAgentOutcomeDto,
  ReprintReceiptDto,
} from "./receipt-queue.dto";

export const RECEIPT_LEASE_MS = 180_000;
const waiting = [
  ReceiptPrintTaskStatus.PENDING,
  ReceiptPrintTaskStatus.PROCESSING,
];

function manualSelectionHash(dto: ReprintReceiptDto) {
  const selection = (dto.itemRoutes ?? [])
    .map(({ itemId, printerId, skip }) => ({
      itemId,
      printerId: printerId ?? null,
      skip: skip === true,
    }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
  // Preserve the hash of requests made by older clients during HTTP retries.
  const payload = dto.mainCopies === undefined
    ? selection
    : { mainCopies: dto.mainCopies, itemRoutes: selection };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

@Injectable()
export class ReceiptQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private directAgentEnabled() {
    return Boolean(this.config.get("RECEIPT_AGENT_API_TOKEN", { infer: true }));
  }

  private authorize(actor: AuthUser) {
    if (
      !([Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN] as Role[]).includes(
        actor.role,
      ) &&
      !actor.expandedAdminPages.includes(AdminPage.ORDERS)
    )
      throw new ForbiddenException(
        "Receipt queue is restricted to operations staff",
      );
  }
  private view(task: ReceiptPrintTask & { order: { number: number } }) {
    const plan = task.plan as unknown as ReceiptPrintPlanResponseDto;
    return {
      id: task.id,
      orderId: task.orderId,
      orderNumber: task.order.number,
      itemNames: [...new Set([
        ...(plan.mainJob?.items ?? []),
        ...plan.jobs.flatMap((job) => job.items),
      ].map((item) => item.name))],
      documentType: task.documentType,
      status: task.status,
      attempts: task.attempts,
      createdAt: task.createdAt.toISOString(),
      nextAttemptAt: task.nextAttemptAt.toISOString(),
      stationId: task.stationId,
      lastError: task.lastError,
      deliveredAt: task.deliveredAt?.toISOString() ?? null,
    };
  }
  private async lock(tx: Prisma.TransactionClient) {
    // Updating one permanent row obtains a transactional row lock. This makes
    // selection + claim atomic without a second in-memory scheduler or raw SQL.
    await tx.receiptPrintQueue.update({
      where: { id: "default" },
      data: { revision: { increment: 1 } },
    });
  }
  async list(actor: AuthUser) {
    this.authorize(actor);
    const [items, pending, needsAttention] = await Promise.all([
      this.prisma.receiptPrintTask.findMany({
        where: {
          status: { in: ["PENDING", "PROCESSING", "FAILED", "UNCERTAIN"] },
        },
        include: { order: { select: { number: true } } },
        orderBy: { sequence: "asc" },
        take: 50,
      }),
      this.prisma.receiptPrintTask.count({
        where: { status: { in: waiting } },
      }),
      this.prisma.receiptPrintTask.count({
        where: { status: { in: ["FAILED", "UNCERTAIN"] } },
      }),
    ]);
    return {
      items: items.map((t) => this.view(t)),
      pending,
      needsAttention,
      consumerMode: this.directAgentEnabled()
        ? ("DIRECT_AGENT" as const)
        : ("BROWSER_BRIDGE" as const),
    };
  }
  async history(actor: AuthUser) {
    this.authorize(actor);
    return {
      items: (
        await this.prisma.receiptPrintTask.findMany({
          include: { order: { select: { number: true } } },
          orderBy: { sequence: "desc" },
          take: 100,
        })
      ).map((task) => this.view(task)),
    };
  }
  async claim(actor: AuthUser, stationId: string) {
    this.authorize(actor);
    // Once the dedicated print key is configured, the browser may still
    // inspect/retry the queue but can no longer become a second worker.
    if (this.directAgentEnabled()) return { task: null };
    return this.claimFor(stationId, actor.id);
  }

  claimAgent(stationId: string) {
    return this.claimFor(stationId, stationId);
  }

  private async claimFor(stationId: string, claimedBy: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const now = new Date();
      await tx.receiptPrintTask.updateMany({
        where: {
          status: "PROCESSING",
          leaseExpiresAt: { lte: now },
          documentType: "ORDER",
          order: { status: "CANCELLED" },
        },
        data: { status: "UNCERTAIN", lastError: "ORDER_CANCELLED_DURING_SEND" },
      });
      await tx.receiptPrintTask.updateMany({
        where: { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        data: { status: "PENDING", lastError: "AGENT_UNAVAILABLE" },
      });
      if (
        await tx.receiptPrintTask.findFirst({
          where: { status: "PROCESSING" },
          select: { id: true },
        })
      )
        return { task: null };
      // A lost acknowledgment is replayed only on the original agent journal.
      // A different workstation must never resend an ambiguous dispatch.
      const next = await tx.receiptPrintTask.findFirst({
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: now },
          OR: [{ stationId: null }, { stationId }],
        },
        orderBy: { sequence: "asc" },
      });
      if (!next) return { task: null };
      const task = await tx.receiptPrintTask.update({
        where: { id: next.id },
        data: {
          status: "PROCESSING",
          stationId,
          claimedBy,
          claimToken: randomUUID(),
          leaseExpiresAt: new Date(now.getTime() + RECEIPT_LEASE_MS),
          attempts: { increment: 1 },
        },
        include: { order: { select: { number: true } } },
      });
      return {
        task: {
          ...this.view(task),
          dispatchId: task.dispatchId,
          claimToken: task.claimToken!,
          leaseExpiresAt: task.leaseExpiresAt!.toISOString(),
          plan: task.plan as unknown as ReceiptPrintPlanResponseDto,
        },
      };
    });
  }
  async heartbeat(actor: AuthUser, id: string, dto: ReceiptLeaseDto) {
    this.authorize(actor);
    return this.heartbeatFor(actor.id, id, dto.stationId, dto.claimToken);
  }

  heartbeatAgent(stationId: string, id: string, dto: ReceiptAgentLeaseDto) {
    return this.heartbeatFor(stationId, id, stationId, dto.claimToken);
  }

  private async heartbeatFor(
    claimedBy: string,
    id: string,
    stationId: string,
    claimToken: string,
  ) {
    const result = await this.prisma.receiptPrintTask.updateMany({
      where: {
        id,
        stationId,
        claimToken,
        claimedBy,
        status: "PROCESSING",
        leaseExpiresAt: { gt: new Date() },
      },
      data: { leaseExpiresAt: new Date(Date.now() + RECEIPT_LEASE_MS) },
    });
    if (result.count !== 1)
      throw new ConflictException(
        "Receipt lease no longer belongs to this worker",
      );
    return { ok: true };
  }
  async acknowledge(actor: AuthUser, id: string, dto: ReceiptOutcomeDto) {
    this.authorize(actor);
    return this.acknowledgeFor(actor.id, actor.id, id, dto.stationId, dto);
  }

  acknowledgeAgent(stationId: string, id: string, dto: ReceiptAgentOutcomeDto) {
    return this.acknowledgeFor(stationId, null, id, stationId, dto);
  }

  private async acknowledgeFor(
    claimedBy: string,
    auditActorId: string | null,
    id: string,
    stationId: string,
    dto: ReceiptAgentOutcomeDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const task = await tx.receiptPrintTask.findUnique({
        where: { id },
        include: { order: { select: { number: true, status: true } } },
      });
      if (!task) throw new NotFoundException("Receipt task not found");
      if (
        task.claimedBy !== claimedBy ||
        task.stationId !== stationId ||
        task.claimToken !== dto.claimToken
      )
        throw new ConflictException("Receipt lease belongs to another worker");
      const cancelledDuringSend =
        task.documentType === "ORDER" && task.order.status === "CANCELLED";
      // A matching late acknowledgment may settle a lease stopped after order
      // cancellation. It must not restart any original print work.
      const lateCancelledDelivery =
        cancelledDuringSend &&
        dto.outcome === "DELIVERED" &&
        ((task.status === "UNCERTAIN" &&
          task.lastError === "ORDER_CANCELLED_DURING_SEND") ||
          (task.status === "CANCELLED" &&
            task.lastError === "ORDER_CANCELLED" &&
            task.attempts > 0));
      if (task.status !== "PROCESSING" && !lateCancelledDelivery) {
        // An HTTP acknowledgment can itself be retried, but cannot change a
        // terminal outcome or overwrite a replacement claim token.
        if (task.status === "DELIVERED" && dto.outcome === "DELIVERED")
          return this.view(task);
        throw new ConflictException("Receipt task is not processing");
      }
      const status =
        dto.outcome === "RETRY"
          ? cancelledDuringSend
            ? "UNCERTAIN"
            : "PENDING"
          : dto.outcome;
      const updated = await tx.receiptPrintTask.update({
        where: { id },
        data: {
          status,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(60_000, 2_000 * 2 ** Math.min(task.attempts, 5)),
          ),
          deliveredAt: status === "DELIVERED" ? new Date() : null,
          lastError:
            status === "DELIVERED"
              ? null
              : cancelledDuringSend && dto.outcome === "RETRY"
                ? "ORDER_CANCELLED_DURING_SEND"
                : (dto.errorCode ?? "AGENT_UNAVAILABLE"),
        },
        include: { order: { select: { number: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: auditActorId,
          action: "receipt.delivery_result",
          entityType: "ReceiptPrintTask",
          entityId: id,
          metadata: {
            status,
            attempt: task.attempts,
            stationId,
            authType: auditActorId ? "STAFF_JWT" : "PRINT_AGENT",
            paperConfirmed: false,
          },
        },
      });
      if (status === "DELIVERED" && task.documentType === "ORDER")
        await this.orders.enqueueLateKitchenCancellation(
          tx,
          task.orderId,
          task.id,
        );
      return this.view(updated);
    });
  }
  async retry(actor: AuthUser, id: string) {
    this.authorize(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const result = await tx.receiptPrintTask.updateMany({
        where: {
          id,
          NOT: { documentType: "ORDER", order: { status: "CANCELLED" } },
          OR: [
            { status: "FAILED" },
            { status: "PENDING", nextAttemptAt: { lte: new Date() } },
            { status: "PENDING", attempts: { gt: 0 } },
          ],
        },
        data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null },
      });
      if (result.count !== 1)
        throw new ConflictException(
          "A processing or uncertain receipt cannot be automatically retried",
        );
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.retry_requested",
          entityType: "ReceiptPrintTask",
          entityId: id,
        },
      });
      return { ok: true };
    });
  }

  async cancel(actor: AuthUser, id: string) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException("Only administrators may cancel a receipt");
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const task = await tx.receiptPrintTask.findUnique({
        where: { id },
        include: { order: { select: { number: true } } },
      });
      if (!task) throw new NotFoundException("Receipt task not found");
      if (task.status !== ReceiptPrintTaskStatus.PENDING)
        throw new ConflictException("Only a waiting receipt can be cancelled");
      const updated = await tx.receiptPrintTask.update({
        where: { id },
        data: { status: ReceiptPrintTaskStatus.CANCELLED, lastError: "MANUALLY_CANCELLED" },
        include: { order: { select: { number: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.manually_cancelled",
          entityType: "ReceiptPrintTask",
          entityId: id,
          metadata: { orderId: task.orderId, previousStatus: task.status },
        },
      });
      return this.view(updated);
    });
  }

  async reprint(actor: AuthUser, orderId: string, dto: ReprintReceiptDto) {
    this.authorize(actor);
    const eventKey = `MANUAL:${actor.id}:${dto.idempotencyKey}`;
    const requestHash = manualSelectionHash(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const prior = await tx.receiptPrintTask.findUnique({
        where: { eventKey },
        include: { order: { select: { number: true } } },
      });
      if (prior) {
        if (prior.orderId !== orderId)
          throw new ConflictException(
            "Reprint key already belongs to another order",
          );
        const priorHash = (prior.plan as { manualRequestHash?: unknown })
          .manualRequestHash;
        if (typeof priorHash === "string" && priorHash !== requestHash)
          throw new ConflictException(
            "Reprint key already belongs to a different print selection",
          );
        return this.view(prior);
      }
      const target = await tx.order.findUnique({
        where: { id: orderId },
        select: { cafeId: true },
      });
      if (target?.cafeId) {
        throw new ConflictException("Cafe receipt printing is not configured in the tenant queue");
      }
      const processing = await tx.receiptPrintTask.count({
        where: { orderId, status: "PROCESSING" },
      });
      if (processing)
        throw new ConflictException(
          "A receipt for this order is being printed; wait for its result",
        );
      const plan = await this.orders.receiptPrintPlan(orderId, tx);
      const routes = dto.itemRoutes ?? [];
      if ((routes.length || dto.mainCopies !== undefined) && actor.role !== Role.ADMIN && actor.role !== Role.SUPER_ADMIN)
        throw new ForbiddenException(
          "Only administrators may change receipt routes or copies",
        );
      if (new Set(routes.map((route) => route.itemId)).size !== routes.length)
        throw new ConflictException(
          "Each order item may have only one print route",
        );
      const orderItems = await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true },
      });
      const orderItemIds = new Set(orderItems.map((item) => item.id));
      if (routes.some((route) => !orderItemIds.has(route.itemId)))
        throw new ConflictException(
          "Print route contains an item outside this order",
        );
      if (routes.some((route) => route.skip && route.printerId))
        throw new BadRequestException(
          "A skipped item cannot also have a printer",
        );
      const skippedItemIds = new Set(
        routes.filter((route) => route.skip).map((route) => route.itemId),
      );
      if (skippedItemIds.size === orderItemIds.size)
        throw new BadRequestException(
          "Select at least one order item to print",
        );
      const cancellation =
        plan.documentType === ReceiptDocumentType.CANCELLATION;
      const kitchenItems = plan.jobs.flatMap((job) => job.items);
      const deliveredItemIds = new Set(kitchenItems.map((item) => item.id));
      if (
        cancellation &&
        routes.some(
          (route) => route.printerId && !deliveredItemIds.has(route.itemId),
        )
      )
        throw new BadRequestException(
          "Cannot cancel a kitchen item that was not delivered",
        );
      const items = new Map(
        [
          ...plan.unassignedItems,
          ...(plan.mainJob?.items ?? []),
          // Kitchen cancellation uses sent portions, which may be fewer than
          // the complete order on the main copy (an increase still waiting).
          ...kitchenItems,
        ]
          .filter(
            (item) =>
              (orderItemIds.has(item.id) ||
                (cancellation && deliveredItemIds.has(item.id))) &&
              !skippedItemIds.has(item.id),
          )
          .map((item) => [item.id, item]),
      );
      if (dto.mainCopies !== undefined) {
        if (dto.mainCopies > 0 && !plan.mainJob)
          throw new ConflictException("Main cash register is not configured");
        if (dto.mainCopies === 0) {
          if (routes.some((route) => !route.skip && route.printerId === null))
            throw new BadRequestException("Выберите кухонный аппарат для блюд: печать на главной кассе отключена");
          plan.mainJob = null;
        }
        plan.mainCopies = dto.mainCopies;
      }
      if (
        !plan.mainJob &&
        routes.some((route) => !route.skip && route.printerId === null)
      )
        throw new ConflictException("Main cash register is not configured");
      if (skippedItemIds.size) {
        if (plan.mainJob)
          plan.mainJob.items = plan.mainJob.items.filter(
            (item) => !skippedItemIds.has(item.id),
          );
        if (plan.metadata)
          plan.metadata.customerNote = partialReceiptCustomerNote(
            plan.metadata.customerNote,
          );
      }
      const printerIds = [
        ...new Set(
          routes.flatMap((route) =>
            !route.skip && route.printerId ? [route.printerId] : [],
          ),
        ),
      ];
      const printers = await tx.receiptPrinter.findMany({
        where: { id: { in: printerIds }, isActive: true },
      });
      if (printers.length !== printerIds.length)
        throw new ConflictException("Selected receipt printer is unavailable");
      const selected = new Map(
        routes
          .filter((route) => !route.skip)
          .map((route) => [route.itemId, route.printerId]),
      );
      const endpoints = new Map<
        string,
        {
          printerIp: string;
          printerPort: number;
          transport: (typeof printers)[number]["transport"];
        }
      >();
      for (const job of plan.jobs)
        for (const item of job.items)
          endpoints.set(item.id, {
            printerIp: job.printerIp,
            printerPort: job.printerPort,
            transport: job.transport,
          });
      for (const [itemId, printerId] of selected) {
        if (!printerId) endpoints.delete(itemId);
        else {
          const printer = printers.find((value) => value.id === printerId)!;
          endpoints.set(itemId, {
            printerIp: printer.ipAddress,
            printerPort: printer.port,
            transport: printer.transport,
          });
        }
      }
      const groups = new Map<string, (typeof plan.jobs)[number]>();
      for (const [itemId, item] of items) {
        const endpoint = endpoints.get(itemId);
        if (!endpoint) continue;
        const key = `${endpoint.transport}:${endpoint.printerIp}:${endpoint.printerPort}`;
        const group = groups.get(key) ?? { ...endpoint, items: [] };
        group.items.push(item);
        groups.set(key, group);
      }
      plan.jobs = [...groups.values()];
      plan.unassignedItems = [...items.values()].filter(
        (item) => !endpoints.has(item.id) && !selected.has(item.id),
      );
      if (dto.mainCopies === 0 && (!plan.jobs.length || plan.unassignedItems.length))
        throw new BadRequestException("Выберите кухонный аппарат для каждого отмеченного блюда или включите главную кассу");
      const copies = expandMainReceiptCopies({
        ...plan,
        manualRequestHash: requestHash,
      });
      const cancelled = await tx.receiptPrintTask.updateMany({
        where: {
          orderId,
          OR: [
            { eventKey: { startsWith: "ORDER_CREATED:" } },
            {
              eventKey: { startsWith: "ORDER_EDITED:" },
              documentType: "ORDER",
            },
            { eventKey: { startsWith: "ORDER_CANCELLED:" } },
          ],
          status: { in: ["PENDING", "FAILED", "UNCERTAIN"] },
        },
        data: { status: "CANCELLED", lastError: "SUPERSEDED_BY_MANUAL_PRINT" },
      });
      const task = await tx.receiptPrintTask.create({
        data: { orderId, eventKey, documentType: plan.documentType, plan: copies[0]! },
      });
      for (const [index, copyPlan] of copies.slice(1).entries()) {
        await tx.receiptPrintTask.create({
          data: {
            orderId,
            eventKey: `${eventKey}:MAIN_COPY:${index + 2}`,
            documentType: plan.documentType,
            plan: copyPlan,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "receipt.reprint_requested",
          entityType: "ReceiptPrintTask",
          entityId: task.id,
          metadata: {
            orderId,
            cancelledAutomaticTasks: cancelled.count,
            mainCopies: plan.mainJob ? plan.mainCopies : 0,
            itemRoutes: routes.map(({ itemId, printerId, skip }) => ({
              itemId,
              printerId,
              skipped: skip ?? false,
            })),
          },
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { number: true },
      });
      return this.view({ ...task, order });
    });
  }
}
